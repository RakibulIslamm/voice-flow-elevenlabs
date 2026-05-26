import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { Call } from '@/lib/db/models/call';
import { loadToolContext } from '@/lib/elevenlabs/webhook-context';
import { TOOL_HANDLERS } from '@/lib/tools/handlers';
import type { VoiceFlowToolName } from '@/lib/elevenlabs/tools';
import { logError } from '@/lib/tracking/log-error';

const KNOWN_TOOLS: Set<VoiceFlowToolName> = new Set([
  'check_availability',
  'book_appointment',
  'book_reservation',
  'log_lead',
  'transfer_to_human',
  'get_current_datetime',
  'get_business_hours',
  'get_business_info',
  'lookup_booking',
  'cancel_booking',
  'reschedule_booking',
  'send_confirmation',
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

  const verified = await loadToolContext(req);
  if (!verified.ok) {
    // No HMAC means no genuine 401 surface — every failure here is a
    // misconfiguration (missing agent_id, agent not found, etc.). Log
    // it so the operator can debug from ErrorLog, then return a graceful
    // 200 so the LLM apologises instead of retrying.
    void logError(new Error(`Tool context load failed: ${verified.code}`), {
      scope: 'tool-dispatch',
      stage: 'load-context',
      toolName,
      code: verified.code,
      message: verified.message,
    });
    return NextResponse.json({
      success: false,
      error: 'Could not complete this action. Please try again or ask the human to follow up.',
      _diagnostic: verified.code,
    });
  }

  const { ctx } = verified;

  // The tool handler needs the Call doc to record toolCalls + outcome.
  // Prefer an exact match on conversation_id; otherwise fall back to the
  // most recent in-progress Call for this agent — that catches tool calls
  // fired before post-call upgrades the externalCallId from `pending-{uuid}`.
  const call = ctx.conversationId
    ? await Call.findOne({ externalCallId: ctx.conversationId })
    : null;

  const fallbackCall = !call
    ? await Call.findOne({
        agentId: ctx.agent._id,
        $or: [{ status: 'in-progress' }, { externalCallId: /^pending-/ }],
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
