import 'server-only';
import { z } from 'zod';
import type { HydratedDocument, Types } from 'mongoose';
import { Call, type CallDoc } from '@/lib/db/models/call';
import { Capture } from '@/lib/db/models/capture';
import type { AgentDoc } from '@/lib/db/models/agent';
import type { UserDoc } from '@/lib/db/models/user';
import type { VoiceFlowToolName } from '@/lib/elevenlabs/tools';
import { sendToolNotification } from '@/lib/email/send-tool-notification';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ToolContext = {
  call: HydratedDocument<CallDoc>;
  agent: HydratedDocument<AgentDoc>;
  user: HydratedDocument<UserDoc>;
};

/** What the handler returns. Shape echoes back to the ElevenLabs LLM. */
export type ToolResponse = Record<string, unknown>;

type ToolHandler = (input: unknown, ctx: ToolContext) => Promise<ToolResponse>;

// ---------------------------------------------------------------------------
// Zod schemas — line up exactly with the JSON Schema declared in
// src/lib/elevenlabs/tools.ts. If you add a tool field there, mirror it
// here or you'll get a "VALIDATION_ERROR" that's invisible to the LLM
// (it'll see our generic apology response, not the real reason).
// ---------------------------------------------------------------------------

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const timeSchema = z.string().regex(/^\d{1,2}:\d{2}(?::\d{2})?$/, 'time must be HH:MM');

const checkAvailabilityInput = z.object({ date: dateSchema });

const bookAppointmentInput = z.object({
  caller_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  date: dateSchema,
  time: timeSchema,
  reason: z.string().trim().min(1).max(500),
});

const bookReservationInput = z.object({
  caller_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  date: dateSchema,
  time: timeSchema,
  party_size: z.coerce.number().int().min(1).max(40),
  special_requests: z.string().trim().max(1000).optional(),
});

const logLeadInput = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  use_case: z.string().trim().min(1).max(2000),
  budget_range: z.string().trim().max(120).optional(),
  timeline: z.string().trim().max(120).optional(),
});

const transferToHumanInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

// ---------------------------------------------------------------------------
// Per-tool implementations
// ---------------------------------------------------------------------------

// In production this hooks into the user's calendar (Google/Outlook).
// MVP returns plausible-looking mock slots so the agent can confirm
// something to the caller and we can exercise the end-to-end flow.
const MOCK_SLOTS = ['9:00 AM', '11:00 AM', '2:00 PM', '4:30 PM'];

const checkAvailability: ToolHandler = async (raw, ctx) => {
  const input = checkAvailabilityInput.parse(raw);
  await recordToolCall(ctx, 'check_availability', input, { available_slots: MOCK_SLOTS });
  return { available_slots: MOCK_SLOTS, date: input.date };
};

const bookAppointment: ToolHandler = async (raw, ctx) => {
  const input = bookAppointmentInput.parse(raw);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'appointment',
    data: input,
  });

  const output = {
    confirmed: true,
    confirmation_id: capture._id.toString(),
    message: `Appointment confirmed for ${input.date} at ${input.time}.`,
  };
  await recordToolCall(ctx, 'book_appointment', input, output);

  void sendToolNotification({
    kind: 'appointment',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    rows: [
      { label: 'Caller', value: input.caller_name },
      { label: 'Phone', value: input.phone },
      { label: 'Date', value: input.date },
      { label: 'Time', value: input.time },
      { label: 'Reason', value: input.reason },
    ],
  });

  void trackEvent('capture.created', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { type: 'appointment', captureId: capture._id.toString() },
  });

  return output;
};

const bookReservation: ToolHandler = async (raw, ctx) => {
  const input = bookReservationInput.parse(raw);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'reservation',
    data: input,
  });

  const output = {
    confirmed: true,
    confirmation_id: capture._id.toString(),
    message: `Reservation confirmed for ${input.party_size} on ${input.date} at ${input.time}.`,
  };
  await recordToolCall(ctx, 'book_reservation', input, output);

  void sendToolNotification({
    kind: 'reservation',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    rows: [
      { label: 'Diner', value: input.caller_name },
      { label: 'Phone', value: input.phone },
      { label: 'Date', value: input.date },
      { label: 'Time', value: input.time },
      { label: 'Party size', value: String(input.party_size) },
      ...(input.special_requests ? [{ label: 'Requests', value: input.special_requests }] : []),
    ],
  });

  void trackEvent('capture.created', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { type: 'reservation', captureId: capture._id.toString() },
  });

  return output;
};

const logLead: ToolHandler = async (raw, ctx) => {
  const input = logLeadInput.parse(raw);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'lead',
    data: input,
  });

  const output = {
    captured: true,
    capture_id: capture._id.toString(),
    message: "Thanks, I've logged that. Someone will follow up shortly.",
  };
  await recordToolCall(ctx, 'log_lead', input, output);

  void sendToolNotification({
    kind: 'lead',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    rows: [
      { label: 'Name', value: input.name },
      ...(input.company ? [{ label: 'Company', value: input.company }] : []),
      { label: 'Email', value: input.email },
      ...(input.phone ? [{ label: 'Phone', value: input.phone }] : []),
      { label: 'Use case', value: input.use_case },
      ...(input.budget_range ? [{ label: 'Budget', value: input.budget_range }] : []),
      ...(input.timeline ? [{ label: 'Timeline', value: input.timeline }] : []),
    ],
  });

  void trackEvent('capture.created', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { type: 'lead', captureId: capture._id.toString() },
  });

  return output;
};

const transferToHuman: ToolHandler = async (raw, ctx) => {
  const input = transferToHumanInput.parse(raw);

  // Mark the call so the dashboard shows the intent even if the human
  // never follows up. Real call-transfer (warm hand-off to a phone) is
  // a future feature — MVP records intent + notifies.
  ctx.call.outcome = 'transferred';
  await ctx.call.save();

  const output = {
    transferring: true,
    message: 'A team member will be with you shortly. Please hold.',
  };
  await recordToolCall(ctx, 'transfer_to_human', input, output);

  void sendToolNotification({
    kind: 'transfer',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    urgent: true,
    rows: [
      { label: 'Reason', value: input.reason },
      { label: 'When', value: new Date().toISOString() },
    ],
  });

  void trackEvent('call.transfer_requested', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { reason: input.reason },
  });

  return output;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const TOOL_HANDLERS: Record<VoiceFlowToolName, ToolHandler> = {
  check_availability: checkAvailability,
  book_appointment: bookAppointment,
  book_reservation: bookReservation,
  log_lead: logLead,
  transfer_to_human: transferToHuman,
};

/**
 * Pushes a tool-call record onto the Call doc. We use `$push` rather
 * than mutating + saving the loaded doc so concurrent tool calls don't
 * trample each other if ElevenLabs fires two webhooks in parallel.
 */
async function recordToolCall(
  ctx: ToolContext,
  name: VoiceFlowToolName,
  input: unknown,
  output: unknown,
): Promise<void> {
  try {
    await Call.updateOne(
      { _id: ctx.call._id as Types.ObjectId },
      {
        $push: {
          toolCalls: { name, input, output, timestamp: new Date() },
        },
      },
    );
  } catch (e) {
    void logError(e, {
      scope: 'recordToolCall',
      toolName: name,
      callId: ctx.call._id.toString(),
    });
  }
}
