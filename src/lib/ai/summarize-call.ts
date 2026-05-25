import 'server-only';
import { generateText } from 'ai';
import { connectDb } from '@/lib/db/connect';
import { Call, type CallDoc, type TranscriptTurn } from '@/lib/db/models/call';
import { getOpenRouter, PRICE_PER_MILLION, SUMMARY_MODEL_ID } from './openrouter';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';

export type CallSummaryShape = {
  outcome: string;
  summary: string;
  captures_made: Array<{ type: string; details: string }>;
};

const SYSTEM_PROMPT = `You are summarising a phone call between an AI receptionist and a caller. Output ONLY raw JSON (no markdown fences) matching this schema:

{
  "outcome": "one-sentence string describing what happened (e.g. 'Booked an appointment for Friday at 3pm.', 'Caller hung up before completing booking.', 'Logged a sales lead.')",
  "summary": "2-3 sentence string. Focus on what was accomplished and anything the human should follow up on.",
  "captures_made": [
    { "type": "appointment|reservation|lead|callback-request|other", "details": "short string" }
  ]
}

Be concise. Never invent details — if the caller didn't say something, don't write that they did. If no captures were made return an empty array.`;

/**
 * Generates a Claude-powered summary for a completed call.
 *
 * Idempotent at the data layer: if the call already has a `summary`
 * stored, we skip the LLM call. Safe to retry on transient OpenRouter
 * failures — the caller (webhook handler or "Re-fetch summary" button)
 * just calls this again.
 *
 * Returns the persisted Call doc (re-fetched after save) so the caller
 * can immediately fire the summary email without an extra DB round-trip.
 */
export async function summarizeCall(callId: string): Promise<CallDoc | null> {
  await connectDb();
  const call = await Call.findById(callId);
  if (!call) return null;

  if (call.summary && call.outcome) {
    // Already summarised — don't burn another API call.
    return call;
  }

  // Abandoned-call shortcut: no transcript means there's nothing to summarise.
  // Mark the outcome explicitly so the dashboard doesn't render a permanent
  // "Generating summary…" spinner for these.
  if (!call.transcript || call.transcript.length === 0) {
    call.outcome = 'abandoned';
    call.summary = 'Caller did not interact with the agent before hanging up.';
    await call.save();
    void trackEvent('call.summarized', {
      userId: call.userId.toString(),
      agentId: call.agentId.toString(),
      callId: call._id.toString(),
      properties: { skipped: true, reason: 'empty-transcript' },
    });
    return call;
  }

  const router = getOpenRouter();
  const userMessage = renderConversation(call);

  try {
    const result = await generateText({
      model: router(SUMMARY_MODEL_ID),
      system: SYSTEM_PROMPT,
      prompt: userMessage,
      temperature: 0.2,
    });

    const parsed = parseJsonLoose(result.text);
    if (parsed) {
      call.outcome = parsed.outcome.slice(0, 240);
      call.summary = parsed.summary.slice(0, 2_000);
    } else {
      // Model returned something we couldn't parse. Don't lose the work —
      // dump the raw response into summary so the operator at least sees
      // *something*, and mark outcome accordingly.
      call.outcome = 'completed';
      call.summary = result.text.slice(0, 2_000);
      await logError(
        new Error('Could not parse summarisation response as JSON'),
        {
          scope: 'summarizeCall',
          callId,
          rawText: result.text.slice(0, 500),
        },
        { severity: 'low' },
      );
    }

    // Best-effort cost tracking. The AI SDK reports usage tokens for most
    // providers but the field name/shape varies — we read it loosely.
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number }
      | undefined;
    if (usage) {
      const inTok = usage.inputTokens ?? usage.promptTokens ?? 0;
      const outTok = usage.outputTokens ?? usage.completionTokens ?? 0;
      const cost =
        (inTok / 1_000_000) * PRICE_PER_MILLION.input +
        (outTok / 1_000_000) * PRICE_PER_MILLION.output;
      // Add to any existing cost rather than overwrite — leaves room for
      // future per-tool LLM calls to accumulate into the same field.
      call.costUsd = (call.costUsd ?? 0) + cost;
    }

    await call.save();

    void trackEvent('call.summarized', {
      userId: call.userId.toString(),
      agentId: call.agentId.toString(),
      callId: call._id.toString(),
      properties: {
        model: SUMMARY_MODEL_ID,
        outcome: call.outcome,
        costUsd: call.costUsd,
      },
    });

    return call;
  } catch (e) {
    // Hard fail — leave the call without a summary so the UI shows
    // "Summary unavailable — retry" rather than a confusing partial state.
    await logError(
      e,
      { scope: 'summarizeCall', callId, model: SUMMARY_MODEL_ID },
      { severity: 'medium' },
    );
    throw e;
  }
}

function renderConversation(call: CallDoc): string {
  const lines: string[] = [];
  lines.push(`Channel: ${call.channel}`);
  if (call.durationSeconds) lines.push(`Duration: ${call.durationSeconds}s`);
  lines.push('');
  lines.push('--- Transcript ---');
  for (const turn of call.transcript) {
    lines.push(`${turn.role === 'user' ? 'Caller' : 'Agent'}: ${turn.content}`);
  }
  if (call.toolCalls && call.toolCalls.length > 0) {
    lines.push('');
    lines.push('--- Tool calls ---');
    for (const tc of call.toolCalls) {
      lines.push(`[${tc.name}] input: ${safeJson(tc.input)} → output: ${safeJson(tc.output)}`);
    }
  }
  return lines.join('\n');
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '"<unserialisable>"';
  }
}

/**
 * Strips optional ```json … ``` fences and parses what's inside. Returns
 * null on any failure — caller decides what to do with the raw text.
 */
function parseJsonLoose(text: string): CallSummaryShape | null {
  if (!text) return null;
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped) as Partial<CallSummaryShape>;
    if (typeof parsed.outcome !== 'string' || typeof parsed.summary !== 'string') return null;
    const captures = Array.isArray(parsed.captures_made) ? parsed.captures_made : [];
    return {
      outcome: parsed.outcome,
      summary: parsed.summary,
      captures_made: captures
        .filter(
          (c): c is { type: string; details: string } =>
            !!c && typeof c.type === 'string' && typeof c.details === 'string',
        )
        .slice(0, 20),
    };
  } catch {
    return null;
  }
}

// Re-export the type for downstream consumers.
export type { TranscriptTurn };
