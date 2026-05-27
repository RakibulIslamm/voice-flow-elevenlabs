import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { getBillingProvider } from '@/lib/billing';
import { env } from '@/lib/env';

const inputSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business']),
});

/**
 * Unified checkout endpoint. Dispatches to whichever provider the env
 * is configured for (`POLAR_SDK=true` → Polar, else Stripe). The route
 * shape is identical regardless of provider so the UI never branches.
 */
export const POST = safeRoute({
  schema: inputSchema,
  handler: async ({ input }) => {
    const session = await requireUser();
    const userId = session.user.id;
    const userEmail = session.user.email ?? '';

    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const provider = getBillingProvider();

    const { url } = await provider.createCheckoutSession({
      userId,
      userEmail,
      plan: input.plan,
      successUrl: `${baseUrl}/dashboard/billing?success=true`,
      cancelUrl: `${baseUrl}/dashboard/billing?canceled=true`,
    });

    return NextResponse.json({ ok: true, url, provider: provider.name });
  },
});
