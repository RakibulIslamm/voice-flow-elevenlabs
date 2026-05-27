import 'server-only';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { User, type UserDoc } from '@/lib/db/models/user';
import { getPlan } from '@/lib/billing/plans';

export type AgentLimitCheck = {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
};

/**
 * Plan-aware agent limit. Counts the user's existing agents and compares
 * with the per-plan cap. Used by the wizard so a Starter user (3 agents)
 * sees "Upgrade to add more" rather than a silent failure on submit.
 */
export async function checkCanCreateAgent(userId: string): Promise<AgentLimitCheck> {
  await connectDb();
  const [user, count] = await Promise.all([
    User.findById(userId)
      .select('plan')
      .lean<Pick<UserDoc, '_id' | 'plan'> | null>(),
    Agent.countDocuments({ userId: new Types.ObjectId(userId) }),
  ]);
  const plan = getPlan(user?.plan ?? 'free');
  return {
    allowed: count < plan.maxAgents,
    currentCount: count,
    maxAllowed: plan.maxAgents,
  };
}
