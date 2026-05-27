import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { getBillingProvider } from '@/lib/billing';

export const POST = safeRoute({
  handler: async () => {
    const session = await requireUser();
    const provider = getBillingProvider();
    await provider.resumeSubscription({ userId: session.user.id });
    return NextResponse.json({ ok: true, provider: provider.name });
  },
});
