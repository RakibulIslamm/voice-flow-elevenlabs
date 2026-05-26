import 'server-only';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { Call } from '@/lib/db/models/call';
import { Capture } from '@/lib/db/models/capture';
import { User, type UserDoc } from '@/lib/db/models/user';

export type DashboardStats = {
  activeAgents: number;
  totalAgents: number;
  callsThisMonth: number;
  capturesThisMonth: number;
  /** Voice-minutes consumed in the current billing period (decimal). */
  minutesUsed: number;
  /** Plan's monthly voice-minute cap, or null for "unmetered". */
  minutesQuota: number | null;
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

  // Run independent counts in parallel — these all hit different
  // collections and Mongo serves them concurrently. Single round-trip
  // latency dominates total query time on a small dataset.
  const [activeAgents, totalAgents, callsThisMonth, capturesThisMonth, minuteAgg, userDoc] =
    await Promise.all([
      Agent.countDocuments({ userId: userObjectId, status: 'active' }),
      Agent.countDocuments({ userId: userObjectId }),
      Call.countDocuments({ userId: userObjectId, createdAt: { $gte: monthStart } }),
      Capture.countDocuments({ userId: userObjectId, createdAt: { $gte: monthStart } }),
      Call.aggregate<{ totalSeconds: number }>([
        {
          $match: {
            userId: userObjectId,
            createdAt: { $gte: monthStart },
            durationSeconds: { $gt: 0 },
          },
        },
        { $group: { _id: null, totalSeconds: { $sum: '$durationSeconds' } } },
      ]),
      User.findById(userId)
        .select('plan')
        .lean<Pick<UserDoc, '_id' | 'plan'> | null>(),
    ]);

  const minutesUsed = minuteAgg.length > 0 ? minuteAgg[0]!.totalSeconds / 60 : 0;
  const minutesQuota = quotaForPlan(userDoc?.plan ?? 'free');

  return {
    activeAgents,
    totalAgents,
    callsThisMonth,
    capturesThisMonth,
    minutesUsed,
    minutesQuota,
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

/**
 * Voice-minute allocations per plan. Returning `null` means "unmetered" —
 * we don't surface a usage bar in the UI for that case. Phase 13 reads
 * these from a billing config instead of hardcoding.
 */
function quotaForPlan(plan: UserDoc['plan']): number | null {
  switch (plan) {
    case 'free':
      return 100; // 100 minutes / month
    case 'starter':
      return 1000;
    case 'pro':
      return 5000;
    case 'business':
      return null; // unmetered
    default:
      return null;
  }
}
