import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { Call } from '@/lib/db/models/call';
import { verifyAndLoadContext } from '@/lib/elevenlabs/webhook-context';
import { TOOL_HANDLERS } from '@/lib/tools/handlers';
import type { VoiceFlowToolName } from '@/lib/elevenlabs/tools';
import { logError } from '@/lib/tracking/log-error';

const KNOWN_TOOLS: Set<VoiceFlowToolName> = new Set([
  'check_availability',
  'book_appointment',
  'book_reservation',
  'log_lead',
  'transfer_to_human',
]);

/**
 * Single dispatcher for every webhook tool ElevenLabs calls during a
 * conversation. Each tool's parameter shape is validated in handlers.ts
 * — the HTTP layer here only handles signature, lookup, and dispatch.
 *
 * Response contract: ALWAYS return 200 with a structured JSON body, even
 * on failure. ElevenLabs forwards whatever we return to the LLM as the
 * tool result; a non-2xx triggers retries that just waste credit and
 * confuse the caller. The LLM is taught to apologise gracefully when it
 * sees `success: false`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ toolName: string }> },
): Promise<Response> {
  const { toolName } = await params;

  if (!KNOWN_TOOLS.has(toolName as VoiceFlowToolName)) {
    return NextResponse.json({
      success: false,
      error: `Unknown tool: ${toolName}.`,
    });
  }

  const verified = await verifyAndLoadContext(req);
  if (!verified.ok) {
    // Genuine auth failures (401) — return the real status so ElevenLabs
    // surfaces the misconfiguration; otherwise we'd silently swallow
    // a wrong webhook secret and pretend tools work.
    if (verified.status === 401) {
      return NextResponse.json(
        { ok: false, error: { code: verified.code, message: verified.message } },
        { status: 401 },
      );
    }
    // Other failures (agent missing, etc.) — graceful 200 so ElevenLabs
    // forwards the apology to the caller instead of looping retries.
    return NextResponse.json({
      success: false,
      error: 'Could not complete this action. Please try again or ask the human to follow up.',
      _diagnostic: verified.code,
    });
  }

  const { ctx } = verified;

  // The tool handler needs the Call doc to record toolCalls + outcome.
  // We look it up by externalCallId (set to ElevenLabs's conversation_id
  // once the post-call webhook lands; before that it's `pending-{uuid}`
  // — meaning tool calls during the FIRST call may not find a match if
  // they arrive before post-call wires up the id).
  const call = ctx.conversationId
    ? await Call.findOne({ externalCallId: ctx.conversationId })
    : null;

  // Fallback: most recent pending Call for this agent. Catches the
  // window between Phase 10's Call.create() and the post-call webhook
  // upgrading `externalCallId`.
  const fallbackCall =
    !call && ctx.conversationId
      ? await Call.findOne({
          agentId: ctx.agent._id,
          externalCallId: /^pending-/,
        }).sort({ createdAt: -1 })
      : null;

  const targetCall = call ?? fallbackCall;

  if (!targetCall) {
    void logError(new Error('Tool webhook had no matching call'), {
      scope: 'tool-dispatch',
      toolName,
      conversationId: ctx.conversationId,
      agentId: ctx.agent._id.toString(),
    });
    return NextResponse.json({
      success: false,
      error: 'Could not find an active call. Please try again.',
    });
  }

  // Upgrade the externalCallId opportunistically — saves the post-call
  // webhook a fallback query later.
  if (
    ctx.conversationId &&
    targetCall.externalCallId !== ctx.conversationId &&
    targetCall.externalCallId.startsWith('pending-')
  ) {
    targetCall.externalCallId = ctx.conversationId;
    await targetCall.save();
  }

  try {
    const handler = TOOL_HANDLERS[toolName as VoiceFlowToolName];
    const output = await handler(ctx.payload, {
      call: targetCall,
      agent: ctx.agent,
      user: ctx.user,
    });
    return NextResponse.json(output);
  } catch (e) {
    void logError(e, {
      scope: 'tool-dispatch',
      toolName,
      callId: targetCall._id.toString(),
    });
    if (e instanceof ZodError) {
      return NextResponse.json({
        success: false,
        error:
          'I didn\'t quite get all the details. Could you share them again, slowly?',
        _diagnostic: e.issues.map((i) => i.message).join('; '),
      });
    }
    return NextResponse.json({
      success: false,
      error: 'Could not complete this action. Please try again or ask the human to follow up.',
    });
  }
}
