/**
 * Tiny timezone helpers shared between the past-date guard and the
 * availability slot generator. Kept dependency-free (no date-fns-tz) by
 * leaning on `Intl.DateTimeFormat` — the same trick the rest of the app
 * uses for grounding "today/tomorrow" in the agent's IANA tz.
 */

export function parseDateTimeInTimezone(
  date: string,
  time: string | undefined,
  tz: string,
): Date | null {
  const t = time && /^\d{1,2}:\d{2}/.test(time) ? time : '00:00';
  const iso = `${date}T${t.length === 4 ? '0' + t : t}:00`;
  const asUtc = new Date(`${iso}Z`);
  if (isNaN(asUtc.getTime())) return null;
  const offsetMin = tzOffsetMinutes(asUtc, tz);
  return new Date(asUtc.getTime() - offsetMin * 60_000);
}

export function tzOffsetMinutes(at: Date, tz: string): number {
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
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (local - at.getTime()) / 60_000;
}

/**
 * Returns the YYYY-MM-DD date string for "now" in the given timezone —
 * used to decide whether the requested booking date is "today" for the
 * lead-time filter.
 */
export function todayInTimezone(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA gives ISO-like YYYY-MM-DD
}

/**
 * Returns the weekday key (`mon` … `sun`) for the given YYYY-MM-DD date
 * resolved in the agent's timezone. Matches the keys used by the
 * `businessHours` schema.
 */
export function weekdayKey(date: string, tz: string): WeekdayKey | null {
  const parsed = parseDateTimeInTimezone(date, '12:00', tz);
  if (!parsed) return null;
  const idx = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(parsed);
  return WEEKDAY_MAP[idx.toLowerCase()] ?? null;
}

const WEEKDAY_MAP: Record<string, WeekdayKey> = {
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
  sun: 'sun',
};

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Parses "09:00" / "9:00" / "9:00 AM" into minutes-from-midnight. */
export function parseClockToMinutes(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Formats minutes-from-midnight as "9:00 AM" / "2:30 PM". */
export function formatMinutesAs12h(total: number): string {
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

/** Formats minutes-from-midnight as the canonical 24h "HH:MM" string. */
export function formatMinutesAs24h(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
