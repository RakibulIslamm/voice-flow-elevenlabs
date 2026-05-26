import 'server-only';

/**
 * Shared header prepended to every template's system prompt. Two jobs:
 *
 *   1. **Ground the agent in real time.** Without this header the LLM
 *      uses its training cutoff as "now" and happily books reservations
 *      for 2023-11-21 when the actual date is 2026-05-25. The
 *      `{{system__time_utc}}` and `{{business_timezone}}` placeholders
 *      are substituted by ElevenLabs at the start of every call.
 *
 *   2. **Teach a consistent confirmation-code protocol.** All booking
 *      tools now return a short `code` (e.g. `R4K9-2X`); the lookup,
 *      cancel, and reschedule tools accept it as primary key. The agent
 *      needs to know to read it back and ask for it later.
 */
export function buildSharedPromptHeader(): string {
  return [
    `## Time awareness (critical)`,
    `Today's date and time, in UTC, is {{system__time_utc}}.`,
    `The business operates in the {{business_timezone}} timezone.`,
    `When the caller says "today", "tomorrow", "this weekend", "next Tuesday", etc., resolve those phrases against the date above BEFORE calling any tool.`,
    `All tools that accept a date expect it in YYYY-MM-DD format.`,
    `All tools that accept a time expect HH:MM in 24-hour format.`,
    `If you're ever unsure of the current date, call get_current_datetime to refresh.`,
    `Never accept a date or time that is in the past — politely ask for a future slot instead.`,
    ``,
    `## Confirmation codes`,
    `Every booking you create returns a short confirmation code, e.g. "R4K9-2X".`,
    `Read it back to the caller slowly and clearly, character-by-character, so they can write it down.`,
    `If a caller wants to look up, cancel, or reschedule an existing booking, ASK for the code first.`,
    `Fall back to name + phone only when the caller cannot find the code.`,
    ``,
    `## Tool usage guidance`,
    `- check_availability before promising a time slot.`,
    `- get_business_hours before answering "are you open at X?" — never guess.`,
    `- get_business_info for address, phone, website questions.`,
    `- send_confirmation after a successful booking if the caller offers an email address.`,
    `- transfer_to_human for anything urgent, sensitive, or beyond your scope.`,
    ``,
  ].join('\n');
}
