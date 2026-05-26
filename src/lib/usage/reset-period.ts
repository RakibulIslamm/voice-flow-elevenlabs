import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';

/**
 * Zeroes the call counter and stamps the new billing window. Called from
 * the Stripe `invoice.paid` webhook handler — Stripe is the source of
 * truth for "what period we're in now" so we trust whatever
 * `current_period_start/end` it sends.
 */
export async function resetUsagePeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  await connectDb();
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'usage.callsThisPeriod': 0,
        'usage.periodStart': periodStart,
        'usage.periodEnd': periodEnd,
      },
    },
  );
}
