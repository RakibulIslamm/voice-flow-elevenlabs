import 'server-only';
import { NextResponse } from 'next/server';
import { safeRoute } from '@/lib/safe-route';
import { requireUser } from '@/lib/auth/guards';
import { getBillingProvider } from '@/lib/billing';
import { env } from '@/lib/env';

export const POST = safeRoute({
  handler: async () => {
    const session = await requireUser();
    const userId = session.user.id;
    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const provider = getBillingProvider();
    const { url } = await provider.createPortalSession({
      userId,
      returnUrl: `${baseUrl}/dashboard/billing`,
    });
    return NextResponse.json({ ok: true, url, provider: provider.name });
  },
});
