'use server';

import { z } from 'zod';
import { Types } from 'mongoose';
import { safeAction } from '@/lib/safe-action';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { Call } from '@/lib/db/models/call';
import { NotFoundError } from '@/lib/errors';
import { summarizeCall } from '@/lib/ai/summarize-call';
import { sendCallSummary } from '@/lib/email/send-call-summary';

const resummarizeInput = z.object({
  callId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid callId.'),
  sendEmail: z.boolean().default(false),
});

/**
 * Manual re-trigger for the post-call summary. Called by the
 * "Re-fetch summary" button on the call detail page when the
 * automatic webhook-fired summary failed or hasn't landed yet.
 *
 * Clearing summary + outcome forces summarizeCall to actually
 * regenerate — otherwise its idempotency guard would skip work.
 */
export const resummarizeCall = safeAction(resummarizeInput, async (input) => {
  const session = await requireUser();
  await connectDb();

  const call = await Call.findById(input.callId);
  if (!call || call.userId.toString() !== session.user.id) {
    throw new NotFoundError('Call not found.');
  }

  // Wipe prior summary so summarizeCall doesn't short-circuit.
  call.summary = undefined;
  call.outcome = undefined;
  await call.save();

  await summarizeCall(input.callId);
  if (input.sendEmail) {
    await sendCallSummary(input.callId);
  }

  return { ok: true };
});

/**
 * Convenience action used by the dashboard's "Resend summary email"
 * link. Email-only — assumes the summary already exists.
 */
export const resendCallSummaryEmail = safeAction(
  z.object({ callId: z.string().regex(/^[a-f0-9]{24}$/i) }),
  async (input) => {
    const session = await requireUser();
    await connectDb();

    const call = await Call.findById(input.callId)
      .select('_id userId')
      .lean<{ _id: Types.ObjectId; userId: Types.ObjectId } | null>();
    if (!call || call.userId.toString() !== session.user.id) {
      throw new NotFoundError('Call not found.');
    }

    await sendCallSummary(input.callId);
    return { ok: true };
  },
);
