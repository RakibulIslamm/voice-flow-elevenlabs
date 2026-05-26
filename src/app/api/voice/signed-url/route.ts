import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { Call } from '@/lib/db/models/call';
import { User } from '@/lib/db/models/user';
import { verifyWidgetToken } from '@/lib/widget/token';
import { getSignedConversationUrl } from '@/lib/elevenlabs/agents';
import {
  AppError,
  NotFoundError,
  QuotaExceededError,
  WidgetUnauthorizedError,
} from '@/lib/errors';
import { trackEvent } from '@/lib/tracking/event';
import { getClientIp } from '@/lib/http/client-ip';
import { checkCanStartCall } from '@/lib/usage/check-quota';

const inputSchema = z.object({
  widgetToken: z.string().min(1),
});

export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input, req }) => {
    const token = verifyWidgetToken(input.widgetToken);
    if (!token) {
      throw new WidgetUnauthorizedError('Widget session expired. Please reload the page.');
    }

    await connectDb();
    const agent = await Agent.findById(token.agentId)
      .select('_id userId elevenLabsAgentId status channels.browser.enabled')
      .lean<{
        _id: Types.ObjectId;
        userId: Types.ObjectId;
        elevenLabsAgentId: string;
        status: string;
        channels?: { browser?: { enabled?: boolean } };
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

    const userId = agent.userId.toString();
    const owner = await User.findById(userId)
      .select('integrations.elevenlabs.enabled')
      .lean<{ integrations?: { elevenlabs?: { enabled?: boolean } } } | null>();
    if (!owner?.integrations?.elevenlabs?.enabled) {
      throw new AppError({
        code: 'AGENT_UNAVAILABLE',
        statusCode: 503,
        publicMessage: 'This agent is temporarily unavailable. Please contact the site owner.',
      });
    }

    // Plan-aware call quota gate. Free users with included quota
    // exhausted get blocked here; paid users with overage allowed pass
    // through (with `willCharge` set on the check result, currently used
    // for telemetry only — Stripe meter event fires post-call).
    const quota = await checkCanStartCall(userId);
    if (!quota.allowed) {
      throw new QuotaExceededError(quota.reason);
    }

    // Provision a local Call doc up-front so transcript writes during the
    // session have something to append to. The `externalCallId` placeholder
    // gets replaced by ElevenLabs' real conversation_id when their
    // post-call webhook fires (Phase 11).
    const callerInfo = {
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') ?? null,
      originDomain: token.origin,
    };
    const call = await Call.create({
      agentId: agent._id,
      userId: agent.userId,
      channel: 'browser',
      externalCallId: `pending-${randomUUID()}`,
      callerInfo,
      startedAt: new Date(),
      status: 'in-progress',
    });

    let signedUrl: string;
    try {
      const res = await getSignedConversationUrl(userId, agent.elevenLabsAgentId);
      signedUrl = res.signedUrl;
    } catch (e) {
      // The Call doc exists but never connected. Mark it failed so it
      // doesn't sit in `in-progress` forever skewing dashboard counts.
      await Call.findByIdAndUpdate(call._id, {
        status: 'failed',
        endedAt: new Date(),
        outcome: 'signed-url-failed',
      });
      throw e;
    }

    void trackEvent('call.started', {
      userId,
      agentId: agent._id.toString(),
      callId: call._id.toString(),
      properties: { channel: 'browser', originDomain: token.origin },
    });

    return NextResponse.json({
      signedUrl,
      callId: call._id.toString(),
    });
  },
});

