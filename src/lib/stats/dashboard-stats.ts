import 'server-only';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { Call } from '@/lib/db/models/call';
import { Capture } from '@/lib/db/models/capture';
import { User, type UserDoc } from '@/lib/db/models/user';
import { getPlan } from '@/lib/billing/plans';

export type DashboardStats = {
  activeAgents: number;
  totalAgents: number;
  callsThisMonth: number;
  capturesThisMonth: number;
  /** Calls counted toward the billing period (matches Stripe's view). */
  callsUsed: number;
  /** Plan's included call quota — `null` only for unmetered tiers. */
  callsQuota: number | null;
  /** Whether the plan allows charged overage beyond `callsQuota`. */
  allowOverage: boolean;
  /** Per-call overage rate in USD. 0 when overage is disallowed. */
  overageRatePerCall: number;
};

/**
 * Returns whatever the user has accumulated since the start of the
 * current calendar month. Phase 13 swaps this for a true "billing
 * period" derived from the user's subscription anchor day; calendar
 * month is the right proxy for MVP and matches the language we already
 * use on the billing page.
 */
export async function loadDashboardStats(userId: string): Promise<DashboardStats> {
  await connectDb();
  const userObjectId = new Types.ObjectId(userId);
  const monthStart = startOfMonth();

  const [activeAgents, totalAgents, callsThisMonth, capturesThisMonth, userDoc] =
    await Promise.all([
      Agent.countDocuments({ userId: userObjectId, status: 'active' }),
      Agent.countDocuments({ userId: userObjectId }),
      Call.countDocuments({ userId: userObjectId, createdAt: { $gte: monthStart } }),
      Capture.countDocuments({ userId: userObjectId, createdAt: { $gte: monthStart } }),
      User.findById(userId)
        .select('plan usage')
        .lean<Pick<UserDoc, '_id' | 'plan' | 'usage'> | null>(),
    ]);

  const plan = getPlan(userDoc?.plan ?? 'free');
  // We trust `usage.callsThisPeriod` (set by the post-call webhook + reset
  // by `invoice.paid`) over the calendar-month aggregate — it's what
  // Stripe will actually charge against.
  const callsUsed = userDoc?.usage?.callsThisPeriod ?? 0;
  const callsQuota = Number.isFinite(plan.includedCalls) ? plan.includedCalls : null;

  return {
    activeAgents,
    totalAgents,
    callsThisMonth,
    capturesThisMonth,
    callsUsed,
    callsQuota,
    allowOverage: plan.allowOverage,
    overageRatePerCall: plan.overageRatePerCall,
  };
}

export type AgentStats = {
  callsThisMonth: number;
  capturesThisMonth: number;
  /** Mean duration of *completed* calls this month, in seconds. */
  avgDurationSeconds: number | null;
  /** Captures / completed calls. `null` when there are no completed calls yet. */
  captureRate: number | null;
};

/**
 * Per-agent equivalent of `loadDashboardStats`. Used by the agent detail
 * Overview tab. Restricts every count to a single agentId.
 */
export async function loadAgentStats(agentId: string): Promise<AgentStats> {
  await connectDb();
  const agentObjectId = new Types.ObjectId(agentId);
  const monthStart = startOfMonth();

  const [callsThisMonth, capturesThisMonth, completedAgg] = await Promise.all([
    Call.countDocuments({ agentId: agentObjectId, createdAt: { $gte: monthStart } }),
    Capture.countDocuments({ agentId: agentObjectId, createdAt: { $gte: monthStart } }),
    Call.aggregate<{ count: number; totalSeconds: number }>([
      {
        $match: {
          agentId: agentObjectId,
          status: 'completed',
          createdAt: { $gte: monthStart },
          durationSeconds: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSeconds: { $sum: '$durationSeconds' },
        },
      },
    ]),
  ]);

  const completedCount = completedAgg[0]?.count ?? 0;
  const avgDurationSeconds =
    completedCount > 0 ? completedAgg[0]!.totalSeconds / completedCount : null;
  const captureRate = completedCount > 0 ? capturesThisMonth / completedCount : null;

  return {
    callsThisMonth,
    capturesThisMonth,
    avgDurationSeconds,
    captureRate,
  };
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
