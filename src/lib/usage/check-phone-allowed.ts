import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { User, type UserDoc } from '@/lib/db/models/user';
import { getPlan } from '@/lib/stripe/plans';

export type PhoneAllowedCheck = {
  allowed: boolean;
  reason: string | null;
  plan: ReturnType<typeof getPlan>;
};

/**
 * Plan gate for the phone channel. Returns the resolved plan alongside
 * the boolean so callers can include richer copy ("Pro+ unlocks phone")
 * without re-loading the user doc.
 */
export async function checkPhoneAllowed(userId: string): Promise<PhoneAllowedCheck> {
  await connectDb();
  const user = await User.findById(userId)
    .select('plan')
    .lean<Pick<UserDoc, '_id' | 'plan'> | null>();
  const plan = getPlan(user?.plan ?? 'free');
  return {
    allowed: plan.allowPhone,
    reason: plan.allowPhone ? null : 'Phone calling requires the Pro plan or above.',
    plan,
  };
}
