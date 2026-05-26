import 'server-only';
import { z } from 'zod';
import type { HydratedDocument, Types } from 'mongoose';
import { Call, type CallDoc } from '@/lib/db/models/call';
import { Capture, type CaptureDoc } from '@/lib/db/models/capture';
import type { AgentDoc } from '@/lib/db/models/agent';
import type { UserDoc } from '@/lib/db/models/user';
import type { VoiceFlowToolName } from '@/lib/elevenlabs/tools';
import { sendToolNotification } from '@/lib/email/send-tool-notification';
import { sendEmail } from '@/lib/email/resend';
import { generateUniqueCaptureCode } from '@/lib/util/short-code';
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
const codeSchema = z
  .string()
  .trim()
  .min(4)
  .max(20)
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9-]/g, ''));

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

const emptyInput = z.object({}).passthrough();

const lookupBookingInput = z
  .object({
    code: codeSchema.optional(),
    caller_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
  })
  .refine((v) => v.code || (v.caller_name && v.phone), {
    message: 'Provide either a confirmation code or both caller_name and phone.',
  });

const cancelBookingInput = z.object({
  code: codeSchema,
  reason: z.string().trim().max(500).optional(),
});

const rescheduleBookingInput = z.object({
  code: codeSchema,
  new_date: dateSchema,
  new_time: timeSchema,
});

const sendConfirmationInput = z.object({
  email: z.string().trim().email().max(200),
  code: codeSchema.optional(),
  summary: z.string().trim().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Past-datetime guard — every booking tool runs this so even a hallucinating
// LLM can't persist a date in the past. We compare against the *agent's*
// configured timezone so "tomorrow 1pm local" doesn't drift across the
// UTC boundary.
// ---------------------------------------------------------------------------

function parseDateTimeInTimezone(date: string, time: string | undefined, tz: string): Date | null {
  const t = time && /^\d{1,2}:\d{2}/.test(time) ? time : '00:00';
  // ISO-ish without offset, then resolve via the agent's IANA tz.
  const iso = `${date}T${t.length === 4 ? '0' + t : t}:00`;
  // Trick: build a Date as if the local string were UTC, then adjust for
  // the difference between UTC and the target tz at that instant. Avoids
  // pulling in a heavyweight tz library.
  const asUtc = new Date(`${iso}Z`);
  if (isNaN(asUtc.getTime())) return null;
  const offsetMin = tzOffsetMinutes(asUtc, tz);
  return new Date(asUtc.getTime() - offsetMin * 60_000);
}

function tzOffsetMinutes(at: Date, tz: string): number {
  // Format the instant into the target tz, parse back, diff = offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? '0');
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (local - at.getTime()) / 60_000;
}

function rejectIfPast(date: string, time: string | undefined, tz: string): ToolResponse | null {
  const resolved = parseDateTimeInTimezone(date, time, tz);
  if (!resolved) {
    return { success: false, error: `I couldn't make sense of the date "${date}". Could you say it again?` };
  }
  if (resolved.getTime() < Date.now()) {
    return {
      success: false,
      error: 'That date or time has already passed. Please pick a future slot.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-tool implementations
// ---------------------------------------------------------------------------

// In production this hooks into the user's calendar (Google/Outlook).
// MVP returns plausible-looking mock slots so the agent can confirm
// something to the caller and we can exercise the end-to-end flow.
const MOCK_SLOTS = ['9:00 AM', '11:00 AM', '2:00 PM', '4:30 PM'];

const checkAvailability: ToolHandler = async (raw, ctx) => {
  const input = checkAvailabilityInput.parse(raw);
  const tz = ctx.agent.businessTimezone || 'UTC';
  const rejection = rejectIfPast(input.date, undefined, tz);
  if (rejection) {
    await recordToolCall(ctx, 'check_availability', input, rejection);
    return rejection;
  }
  const output = { available_slots: MOCK_SLOTS, date: input.date };
  await recordToolCall(ctx, 'check_availability', input, output);
  return output;
};

const bookAppointment: ToolHandler = async (raw, ctx) => {
  const input = bookAppointmentInput.parse(raw);
  const tz = ctx.agent.businessTimezone || 'UTC';
  const rejection = rejectIfPast(input.date, input.time, tz);
  if (rejection) {
    await recordToolCall(ctx, 'book_appointment', input, rejection);
    return rejection;
  }

  const code = await generateUniqueCaptureCode(ctx.user._id);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'appointment',
    code,
    data: input,
  });

  const output = {
    confirmed: true,
    confirmation_code: code,
    confirmation_id: capture._id.toString(),
    message: `Appointment confirmed for ${input.date} at ${input.time}. Your code is ${code}.`,
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
      { label: 'Code', value: code },
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
    properties: { type: 'appointment', captureId: capture._id.toString(), code },
  });

  return output;
};

const bookReservation: ToolHandler = async (raw, ctx) => {
  const input = bookReservationInput.parse(raw);
  const tz = ctx.agent.businessTimezone || 'UTC';
  const rejection = rejectIfPast(input.date, input.time, tz);
  if (rejection) {
    await recordToolCall(ctx, 'book_reservation', input, rejection);
    return rejection;
  }

  const code = await generateUniqueCaptureCode(ctx.user._id);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'reservation',
    code,
    data: input,
  });

  const output = {
    confirmed: true,
    confirmation_code: code,
    confirmation_id: capture._id.toString(),
    message: `Reservation confirmed for ${input.party_size} on ${input.date} at ${input.time}. Your code is ${code}.`,
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
      { label: 'Code', value: code },
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
    properties: { type: 'reservation', captureId: capture._id.toString(), code },
  });

  return output;
};

const logLead: ToolHandler = async (raw, ctx) => {
  const input = logLeadInput.parse(raw);
  const code = await generateUniqueCaptureCode(ctx.user._id);
  const capture = await Capture.create({
    callId: ctx.call._id,
    agentId: ctx.agent._id,
    userId: ctx.user._id,
    type: 'lead',
    code,
    data: input,
  });

  const output = {
    captured: true,
    confirmation_code: code,
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
      { label: 'Code', value: code },
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
    properties: { type: 'lead', captureId: capture._id.toString(), code },
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

// --- New handlers --------------------------------------------------------

const getCurrentDatetime: ToolHandler = async (raw, ctx) => {
  emptyInput.parse(raw);
  const tz = ctx.agent.businessTimezone || 'UTC';
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateOnly = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // YYYY-MM-DD
  const output = {
    iso_utc: now.toISOString(),
    timezone: tz,
    date: dateOnly,
    pretty: fmt.format(now),
  };
  await recordToolCall(ctx, 'get_current_datetime', {}, output);
  return output;
};

const getBusinessHours: ToolHandler = async (raw, ctx) => {
  emptyInput.parse(raw);
  const hours = (ctx.agent.businessHours ?? null) as Record<string, unknown> | null;
  const output = hours
    ? { hours, timezone: ctx.agent.businessTimezone || 'UTC' }
    : { hours: null, message: 'Business hours have not been configured. Ask the caller to call back during typical operating times.' };
  await recordToolCall(ctx, 'get_business_hours', {}, output);
  return output;
};

const getBusinessInfo: ToolHandler = async (raw, ctx) => {
  emptyInput.parse(raw);
  const output = {
    name: ctx.agent.businessName || ctx.agent.name,
    address: ctx.agent.businessAddress || null,
    phone: ctx.agent.businessPhone || null,
    website: ctx.agent.businessWebsite || null,
  };
  await recordToolCall(ctx, 'get_business_info', {}, output);
  return output;
};

async function findCaptureForCaller(
  ctx: ToolContext,
  input: { code?: string; caller_name?: string; phone?: string },
): Promise<HydratedDocument<CaptureDoc> | null> {
  if (input.code) {
    return Capture.findOne({ userId: ctx.user._id, code: input.code });
  }
  if (input.caller_name && input.phone) {
    return Capture.findOne({
      userId: ctx.user._id,
      'data.phone': input.phone,
      $or: [
        { 'data.caller_name': new RegExp(`^${escapeRegex(input.caller_name)}$`, 'i') },
        { 'data.name': new RegExp(`^${escapeRegex(input.caller_name)}$`, 'i') },
      ],
    }).sort({ createdAt: -1 });
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const lookupBooking: ToolHandler = async (raw, ctx) => {
  const input = lookupBookingInput.parse(raw);
  const capture = await findCaptureForCaller(ctx, input);
  const output = capture
    ? {
        found: true,
        code: capture.code,
        type: capture.type,
        status: capture.status,
        details: capture.data,
        created_at: capture.createdAt.toISOString(),
      }
    : {
        found: false,
        message: "I couldn't find a booking matching those details. Could you double-check the confirmation code?",
      };
  await recordToolCall(ctx, 'lookup_booking', input, output);
  return output;
};

const cancelBooking: ToolHandler = async (raw, ctx) => {
  const input = cancelBookingInput.parse(raw);
  const capture = await Capture.findOne({ userId: ctx.user._id, code: input.code });
  if (!capture) {
    const output = {
      success: false,
      error: "I couldn't find a booking with that code. Could you read it back to me?",
    };
    await recordToolCall(ctx, 'cancel_booking', input, output);
    return output;
  }
  if (capture.status === 'cancelled') {
    const output = { success: true, already_cancelled: true, message: 'That booking was already cancelled.' };
    await recordToolCall(ctx, 'cancel_booking', input, output);
    return output;
  }

  capture.status = 'cancelled';
  capture.cancelledAt = new Date();
  await capture.save();

  const data = capture.data as Record<string, unknown>;
  const output = {
    success: true,
    code: capture.code,
    message: `Cancelled. The booking under code ${capture.code} has been cancelled.`,
  };
  await recordToolCall(ctx, 'cancel_booking', input, output);

  void sendToolNotification({
    kind: 'cancellation',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    rows: [
      { label: 'Code', value: capture.code },
      { label: 'Type', value: capture.type },
      { label: 'Caller', value: String(data.caller_name ?? data.name ?? '—') },
      ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
    ],
  });

  void trackEvent('capture.cancelled', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { code: capture.code, type: capture.type },
  });

  return output;
};

const rescheduleBooking: ToolHandler = async (raw, ctx) => {
  const input = rescheduleBookingInput.parse(raw);
  const tz = ctx.agent.businessTimezone || 'UTC';
  const rejection = rejectIfPast(input.new_date, input.new_time, tz);
  if (rejection) {
    await recordToolCall(ctx, 'reschedule_booking', input, rejection);
    return rejection;
  }

  const capture = await Capture.findOne({ userId: ctx.user._id, code: input.code });
  if (!capture) {
    const output = {
      success: false,
      error: "I couldn't find a booking with that code.",
    };
    await recordToolCall(ctx, 'reschedule_booking', input, output);
    return output;
  }
  if (capture.status === 'cancelled') {
    const output = {
      success: false,
      error: 'That booking was already cancelled — you would need to make a new one.',
    };
    await recordToolCall(ctx, 'reschedule_booking', input, output);
    return output;
  }

  const data = { ...((capture.data as Record<string, unknown>) ?? {}) };
  capture.rescheduledFrom = {
    date: typeof data.date === 'string' ? data.date : undefined,
    time: typeof data.time === 'string' ? data.time : undefined,
  };
  data.date = input.new_date;
  data.time = input.new_time;
  capture.data = data;
  capture.status = 'rescheduled';
  capture.rescheduledAt = new Date();
  await capture.save();

  const output = {
    success: true,
    code: capture.code,
    new_date: input.new_date,
    new_time: input.new_time,
    message: `Rescheduled. Your booking is now on ${input.new_date} at ${input.new_time}, under code ${capture.code}.`,
  };
  await recordToolCall(ctx, 'reschedule_booking', input, output);

  void sendToolNotification({
    kind: 'reschedule',
    to: ctx.user.email,
    agentName: ctx.agent.name,
    businessName: ctx.agent.businessName ?? '',
    callId: ctx.call._id.toString(),
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    rows: [
      { label: 'Code', value: capture.code },
      { label: 'Type', value: capture.type },
      { label: 'New date', value: input.new_date },
      { label: 'New time', value: input.new_time },
      ...(capture.rescheduledFrom?.date
        ? [{ label: 'Was', value: `${capture.rescheduledFrom.date} ${capture.rescheduledFrom.time ?? ''}`.trim() }]
        : []),
    ],
  });

  void trackEvent('capture.rescheduled', {
    userId: ctx.user._id.toString(),
    agentId: ctx.agent._id.toString(),
    callId: ctx.call._id.toString(),
    properties: { code: capture.code, type: capture.type },
  });

  return output;
};

const sendConfirmation: ToolHandler = async (raw, ctx) => {
  const input = sendConfirmationInput.parse(raw);
  const businessName = ctx.agent.businessName || ctx.agent.name;
  const subject = `Your ${businessName} confirmation${input.code ? ` (${input.code})` : ''}`;
  const text = [
    `Hi,`,
    ``,
    input.summary,
    ``,
    input.code ? `Confirmation code: ${input.code}` : null,
    ``,
    `If anything looks off, reply to this email or call us back.`,
    ``,
    `— ${businessName}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await sendEmail({
    to: input.email,
    subject,
    text,
  });

  const output = result.ok
    ? { sent: true, message: "I've sent the confirmation to your email." }
    : {
        sent: false,
        message: "I couldn't send that confirmation right now — but your booking is still saved.",
      };
  await recordToolCall(ctx, 'send_confirmation', input, output);
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
  get_current_datetime: getCurrentDatetime,
  get_business_hours: getBusinessHours,
  get_business_info: getBusinessInfo,
  lookup_booking: lookupBooking,
  cancel_booking: cancelBooking,
  reschedule_booking: rescheduleBooking,
  send_confirmation: sendConfirmation,
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
