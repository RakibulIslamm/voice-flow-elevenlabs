import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { User } from '@/lib/db/models/user';
import { signWidgetToken } from '@/lib/widget/token';
import { isOriginAllowed, originToHostname } from '@/lib/widget/domain-check';
import { rateLimit } from '@/lib/rate-limit/in-memory';
import { env } from '@/lib/env';
import {
  AppError,
  NotFoundError,
  WidgetUnauthorizedError,
} from '@/lib/errors';
import { trackEvent } from '@/lib/tracking/event';
import { getClientIp } from '@/lib/http/client-ip';

const inputSchema = z.object({
  agentSlug: z.string().trim().min(1).max(80),
});

/**
 * Bootstraps a widget session. Validates that the calling page is an
 * authorised embed origin, mints a short-lived HMAC token the browser
 * SDK uses to fetch its signed WebSocket URL, and returns the minimum
 * public agent metadata the widget needs to render its header.
 *
 * Public endpoint (no Auth.js session). Defence is layered:
 * - Browser-set `Origin` (cannot be forged from a real browser)
 * - Domain allowlist on the agent
 * - Per-IP rate limit
 * - 5-minute token TTL with HMAC signature
 */
export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input, req }) => {
    const origin = req.headers.get('origin');
    const hostname = originToHostname(origin);
    if (!hostname) {
      throw new WidgetUnauthorizedError(
        'Missing or invalid Origin header. Widget must be loaded from a real browser.',
      );
    }

    // Rate-limit by IP first — cheaper than a DB round-trip when an
    // attacker is grinding. 30 inits/hour is generous for legitimate
    // page-loads and stingy enough to choke abuse.
    const ip = getClientIp(req);
    const { allowed, resetAt } = rateLimit(`widget-init:${ip}`, {
      max: 30,
      windowMs: 60 * 60_000,
    });
    if (!allowed) {
      throw new AppError({
        code: 'RATE_LIMITED',
        statusCode: 429,
        publicMessage:
          'Too many widget requests from this IP. Please try again shortly.',
        meta: { resetAt },
      });
    }

    await connectDb();
    const agent = await Agent.findOne({ 'channels.browser.publicSlug': input.agentSlug })
      .select(
        '_id userId name businessName greeting status channels.browser.enabled channels.browser.allowedDomains',
      )
      .lean<{
        _id: { toString(): string };
        userId: { toString(): string };
        name: string;
        businessName?: string;
        greeting?: string;
        status: string;
        channels?: { browser?: { enabled?: boolean; allowedDomains?: string[] } };
      } | null>();

    if (!agent) throw new NotFoundError('Agent not found.');

    if (!agent.channels?.browser?.enabled) {
      throw new WidgetUnauthorizedError('This agent has disabled web access.');
    }

    if (agent.status !== 'active') {
      throw new AppError({
        code: 'AGENT_UNAVAILABLE',
        statusCode: 503,
        publicMessage: 'This agent is currently unavailable. Please check back later.',
      });
    }

    // Owner-side ElevenLabs status — if they disconnected after embedding,
    // the talk would 500 inside the signed-URL endpoint. Fail fast here
    // with the clearer "temporarily unavailable" copy.
    const owner = await User.findById(agent.userId)
      .select('integrations.elevenlabs.enabled')
      .lean<{ integrations?: { elevenlabs?: { enabled?: boolean } } } | null>();
    if (!owner?.integrations?.elevenlabs?.enabled) {
      throw new AppError({
        code: 'AGENT_UNAVAILABLE',
        statusCode: 503,
        publicMessage: 'This agent is temporarily unavailable. Please contact the site owner.',
      });
    }

    // Our own hosted talk page is always allowed regardless of allowlist
    // — the agent owner wouldn't think to allow their own VoiceFlow URL.
    const appHostname = originToHostname(env.NEXT_PUBLIC_APP_URL);
    const isHostedTalkPage = !!appHostname && appHostname === hostname;
    const allowedDomains = agent.channels?.browser?.allowedDomains ?? [];

    if (!isHostedTalkPage && !isOriginAllowed(hostname, allowedDomains)) {
      void trackEvent('widget.init.blocked_origin', {
        userId: agent.userId.toString(),
        agentId: agent._id.toString(),
        properties: { hostname, allowedDomains },
      });
      throw new WidgetUnauthorizedError(
        'Embed not authorized for this domain. Contact the site owner.',
      );
    }

    const widgetToken = signWidgetToken({
      agentId: agent._id.toString(),
      origin: hostname,
    });

    void trackEvent('widget.init.allowed', {
      userId: agent.userId.toString(),
      agentId: agent._id.toString(),
      properties: { hostname, hosted: isHostedTalkPage },
    });

    return NextResponse.json({
      widgetToken,
      agentName: agent.name,
      businessName: agent.businessName ?? '',
      greeting: agent.greeting ?? '',
    });
  },
});
