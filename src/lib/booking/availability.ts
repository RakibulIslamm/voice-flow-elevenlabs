import { Capture } from '@/lib/db/models/capture';
import type { AgentDoc, AgentBookingConfig } from '@/lib/db/models/agent';
import {
  formatMinutesAs12h,
  formatMinutesAs24h,
  parseClockToMinutes,
  parseDateTimeInTimezone,
  todayInTimezone,
  tzOffsetMinutes,
  weekdayKey,
  type WeekdayKey,
} from '@/lib/booking/time';

/**
 * Sensible per-template defaults so existing agents without `bookingConfig`
 * still produce real availability. Restaurants get a higher per-slot
 * capacity (3 tables) because they typically seat more than one party at
 * the same clock-time — appointments are 1:1.
 */
export function resolveBookingConfig(agent: Pick<AgentDoc, 'template' | 'bookingConfig'>): AgentBookingConfig {
  const defaults: AgentBookingConfig =
    agent.template === 'restaurant'
      ? { slotDurationMinutes: 30, capacityPerSlot: 3, leadTimeMinutes: 30, maxDaysAhead: 60 }
      : { slotDurationMinutes: 30, capacityPerSlot: 1, leadTimeMinutes: 0, maxDaysAhead: 60 };
  return {
    slotDurationMinutes: agent.bookingConfig?.slotDurationMinutes ?? defaults.slotDurationMinutes,
    capacityPerSlot: agent.bookingConfig?.capacityPerSlot ?? defaults.capacityPerSlot,
    leadTimeMinutes: agent.bookingConfig?.leadTimeMinutes ?? defaults.leadTimeMinutes,
    maxDaysAhead: agent.bookingConfig?.maxDaysAhead ?? defaults.maxDaysAhead,
  };
}

export type BusinessHoursDay = { open?: string; close?: string; closed?: boolean };
export type BusinessHours = Partial<Record<WeekdayKey, BusinessHoursDay>>;

/**
 * Reads the agent's `businessHours.Mixed` blob defensively. Returns null
 * when the day either isn't configured, is explicitly closed, or has
 * unparseable open/close values.
 */
function dayHours(hours: unknown, key: WeekdayKey): { openMin: number; closeMin: number } | null {
  if (!hours || typeof hours !== 'object') return null;
  const day = (hours as BusinessHours)[key];
  if (!day || day.closed) return null;
  if (typeof day.open !== 'string' || typeof day.close !== 'string') return null;
  const openMin = parseClockToMinutes(day.open);
  const closeMin = parseClockToMinutes(day.close);
  if (openMin == null || closeMin == null || closeMin <= openMin) return null;
  return { openMin, closeMin };
}

export type SlotStatus = 'open' | 'closed' | 'past' | 'too-far' | 'invalid';

export type AvailabilityResult = {
  status: SlotStatus;
  /** 12-hour formatted strings the LLM can read back verbatim. */
  slots: string[];
  /** Caller-facing reason — populated whenever status !== 'open'. */
  message?: string;
};

/**
 * Generates the list of available booking slots for `dateISO`, in the
 * agent's local time, after subtracting confirmed/rescheduled captures.
 *
 * Pure-ish: takes one DB call (the Capture count). Designed to be the
 * single source of truth — both the LLM-facing `check_availability` tool
 * and the race-check inside `book_*` call into this.
 */
export async function listAvailableSlots(
  agent: HydratedAgent,
  dateISO: string,
): Promise<AvailabilityResult> {
  const tz = agent.businessTimezone || 'UTC';
  const cfg = resolveBookingConfig(agent);

  const day = weekdayKey(dateISO, tz);
  if (!day) return { status: 'invalid', slots: [], message: `I couldn't make sense of the date "${dateISO}".` };

  // Anti-spam guard — block bookings too far out so a hallucinating LLM
  // can't accept "September 2030" without operator review.
  const requested = parseDateTimeInTimezone(dateISO, '12:00', tz);
  if (!requested) return { status: 'invalid', slots: [], message: `I couldn't make sense of the date "${dateISO}".` };
  const daysOut = Math.round((requested.getTime() - Date.now()) / 86_400_000);
  if (daysOut > cfg.maxDaysAhead) {
    return {
      status: 'too-far',
      slots: [],
      message: `That's beyond what I can book — please pick a date within the next ${cfg.maxDaysAhead} days.`,
    };
  }

  const hours = dayHours(agent.businessHours, day);
  if (!hours) {
    return { status: 'closed', slots: [], message: "We're closed on that day. Want me to check another date?" };
  }

  // Build every potential slot from open → close at the configured step.
  // Drop slots whose *start* lands on or past close, so a 30-min slot at
  // a 17:00 close means the last bookable slot starts at 16:30.
  const all: number[] = [];
  for (let t = hours.openMin; t + cfg.slotDurationMinutes <= hours.closeMin; t += cfg.slotDurationMinutes) {
    all.push(t);
  }
  if (all.length === 0) {
    return { status: 'closed', slots: [], message: "We're closed on that day. Want me to check another date?" };
  }

  // Subtract booked slots (active captures only — cancelled doesn't count).
  const taken = await countBookingsByTime(agent._id, dateISO);
  const free = all.filter((t) => {
    const key = formatMinutesAs24h(t);
    const used = taken.get(key) ?? 0;
    return used < cfg.capacityPerSlot;
  });

  // If the request is for "today" in the agent's tz, filter out slots
  // that have already passed (plus lead time buffer).
  const today = todayInTimezone(tz);
  let displayable = free;
  if (dateISO === today) {
    const nowMin = nowMinutesInTz(tz);
    displayable = free.filter((t) => t >= nowMin + cfg.leadTimeMinutes);
  }

  if (displayable.length === 0) {
    return {
      status: dateISO === today ? 'past' : 'closed',
      slots: [],
      message:
        dateISO === today
          ? "We're fully booked for the rest of today. Try another date?"
          : "We're fully booked that day. Try another date?",
    };
  }

  return { status: 'open', slots: displayable.map(formatMinutesAs12h) };
}

/**
 * Race-safe re-check used by `book_appointment` / `book_reservation` /
 * `reschedule_booking` immediately before writing the capture. The
 * availability snapshot the LLM acted on can be seconds stale, so this is
 * a final guard.
 */
export async function isSlotFree(
  agent: HydratedAgent,
  dateISO: string,
  time: string,
): Promise<boolean> {
  const tz = agent.businessTimezone || 'UTC';
  const cfg = resolveBookingConfig(agent);
  const day = weekdayKey(dateISO, tz);
  if (!day) return false;
  const hours = dayHours(agent.businessHours, day);
  if (!hours) return false;

  const min = parseClockToMinutes(time);
  if (min == null) return false;
  if (min < hours.openMin || min + cfg.slotDurationMinutes > hours.closeMin) return false;

  // Snap the LLM's time string to the canonical 24h key so off-by-one
  // matches (e.g. "9:00" vs "09:00") never let a double-book slip through.
  const key = formatMinutesAs24h(min);
  const taken = await countBookingsByTime(agent._id, dateISO);
  const used = taken.get(key) ?? 0;
  return used < cfg.capacityPerSlot;
}

/**
 * Counts active bookings per `data.time` (canonical 24h key) for one
 * agent + date. Pulled into its own helper so both the listing and the
 * race-check share the same query.
 */
async function countBookingsByTime(
  agentId: HydratedAgent['_id'],
  dateISO: string,
): Promise<Map<string, number>> {
  const rows = await Capture.find({
    agentId,
    'data.date': dateISO,
    type: { $in: ['appointment', 'reservation'] },
    status: { $in: ['confirmed', 'rescheduled'] },
  })
    .select({ 'data.time': 1 })
    .lean<Array<{ data?: { time?: string } }>>();

  const out = new Map<string, number>();
  for (const r of rows) {
    const raw = r.data?.time;
    if (typeof raw !== 'string') continue;
    const min = parseClockToMinutes(raw);
    if (min == null) continue;
    const key = formatMinutesAs24h(min);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function nowMinutesInTz(tz: string): number {
  const now = new Date();
  const offset = tzOffsetMinutes(now, tz);
  // Convert "now" into the tz-local wall clock, then read its minutes-of-day.
  const local = new Date(now.getTime() + offset * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/**
 * Narrowest possible shape of the Agent doc the module needs — keeps the
 * dependency on the model surface minimal so unit tests can pass plain
 * objects.
 */
type HydratedAgent = Pick<
  AgentDoc,
  '_id' | 'template' | 'businessTimezone' | 'businessHours' | 'bookingConfig'
>;
