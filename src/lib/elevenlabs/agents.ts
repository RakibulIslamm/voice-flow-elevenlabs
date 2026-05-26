import 'server-only';
import { getElevenLabsClient } from './client';
import { ExternalServiceError } from '@/lib/errors';
import type { VoiceFlowTool } from './tools';

/**
 * LLMs ElevenLabs Conversational AI accepts. Keep this list curated to
 * options we've validated; passing an unknown model crashes the SDK call.
 * Update when ElevenLabs ships new options.
 */
export type ElevenLabsLLM =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku';

/**
 * Canonical VoiceFlow agent config. We translate this to whatever shape
 * the ElevenLabs SDK currently expects inside `buildSdkRequest()` — so if
 * their schema evolves, callers (the wizard, the API routes) don't move.
 */
export type AgentConfig = {
  name: string;
  voiceId: string;
  firstMessage: string;
  systemPrompt: string;
  llm: ElevenLabsLLM;
  /**
   * IDs of standalone ElevenLabs tool documents to attach to this agent.
   * Tools are first-class resources in the user's workspace — create them
   * via `createTools()` first, then pass the returned ids here. The legacy
   * inline `tools` array is deprecated; ElevenLabs only honours `toolIds`
   * now.
   */
  toolIds?: string[];
  /**
   * Free-form dynamic variables injected into the system prompt at the
   * start of every call. Used to ground placeholders like
   * `{{business_timezone}}` that the prompt header references.
   */
  dynamicVariables?: Record<string, string>;
  /** ISO 639-1 ASR/TTS language code. Defaults to 'en'. */
  language?: string;
  /**
   * IANA timezone string written to the SDK's native `prompt.timezone`
   * field. ElevenLabs uses it to ground the agent's internal
   * date/time reasoning AND to display the timezone in the dashboard —
   * "No timezone set" appears when this isn't sent.
   */
  timezone?: string;
  /** 0-1; lower = more deterministic. Defaults to the SDK's default. */
  temperature?: number;
  /**
   * TTS model override. Pass `'eleven_v3_conversational'` to enable
   * Expressive Mode (emotion-aware delivery). Omit to use the agent's
   * existing model (ElevenLabs's default for new agents).
   */
  ttsModelId?: string;
};

export type CreateAgentResult = { agentId: string };

/**
 * Creates a Conversational AI agent in the USER'S ElevenLabs account.
 * The agent runs entirely under their billing — VoiceFlow holds nothing
 * beyond the agent ID we save against the local Agent document.
 */
export async function createAgent(
  userId: string,
  config: AgentConfig,
): Promise<CreateAgentResult> {
  const client = await getElevenLabsClient(userId);
  try {
    // The SDK's generated request type is verbose and shifts between
    // versions. We cast through `unknown` so we control the wire format
    // here in one place — `buildSdkRequest()` is the single source of
    // truth for whatever shape ElevenLabs currently accepts.
    const res = await client.conversationalAi.agents.create(
      buildSdkRequest(config, { mode: 'create' }) as unknown as Parameters<
        typeof client.conversationalAi.agents.create
      >[0],
    );
    const agentId = pickAgentId(res);
    if (!agentId) {
      throw new ExternalServiceError(
        'ElevenLabs',
        'Agent created but no agent_id was returned.',
      );
    }
    return { agentId };
  } catch (e) {
    throw toExternalError(e, 'create agent');
  }
}

/**
 * Updates an existing agent's config. Use sparingly — every save call is
 * a write to ElevenLabs' platform and counts against the user's API rate
 * limit on their account.
 */
export async function updateAgent(
  userId: string,
  agentId: string,
  config: Partial<AgentConfig>,
): Promise<void> {
  const client = await getElevenLabsClient(userId);
  try {
    await client.conversationalAi.agents.update(
      agentId,
      buildSdkRequest(config, { mode: 'update' }) as unknown as Parameters<
        typeof client.conversationalAi.agents.update
      >[1],
    );
  } catch (e) {
    throw toExternalError(e, 'update agent');
  }
}

/**
 * Removes an agent from the user's ElevenLabs account. **Best-effort:**
 * we catch any SDK error and return `{ ok: false }` so the calling action
 * can decide whether to also delete the local Agent doc or not. Failing
 * to delete on ElevenLabs' side is annoying but not catastrophic — they
 * have an orphaned agent in their dashboard, no billing impact since
 * agents aren't billed when idle.
 */
export async function deleteAgent(
  userId: string,
  agentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const client = await getElevenLabsClient(userId);
    await client.conversationalAi.agents.delete(agentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * Fetches an agent from the user's ElevenLabs account.
 *
 * Returns `{ exists: false }` when ElevenLabs answers with 404 — the
 * caller uses this to detect "the user deleted the agent from their
 * ElevenLabs dashboard out from under us" and surface a re-activation
 * blocker. Any other error bubbles as ExternalServiceError.
 */
export async function getAgent(
  userId: string,
  agentId: string,
): Promise<{ exists: boolean }> {
  const client = await getElevenLabsClient(userId);
  try {
    await client.conversationalAi.agents.get(agentId);
    return { exists: true };
  } catch (e) {
    if (isNotFoundError(e)) return { exists: false };
    throw toExternalError(e, 'fetch agent');
  }
}

function isNotFoundError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { statusCode?: unknown; status?: unknown; message?: unknown };
  if (err.statusCode === 404 || err.status === 404) return true;
  if (typeof err.message === 'string' && /\b404\b|not[\s_-]?found/i.test(err.message)) {
    return true;
  }
  return false;
}

/**
 * Returns a short-lived signed WebSocket URL for a private agent so the
 * browser SDK can connect without us ever exposing the user's API key.
 * URLs expire — call this on every page load, don't cache server-side.
 */
export async function getSignedConversationUrl(
  userId: string,
  agentId: string,
): Promise<{ signedUrl: string }> {
  const client = await getElevenLabsClient(userId);
  try {
    const res = await client.conversationalAi.conversations.getSignedUrl({ agentId });
    const signedUrl = pickSignedUrl(res);
    if (!signedUrl) {
      throw new ExternalServiceError(
        'ElevenLabs',
        'No signed URL was returned for this agent.',
      );
    }
    return { signedUrl };
  } catch (e) {
    throw toExternalError(e, 'get signed conversation URL');
  }
}

// ---------------------------------------------------------------------------
// Internal adapters
// ---------------------------------------------------------------------------

/**
 * Translates VoiceFlow's canonical AgentConfig into the SDK's request body.
 *
 * Important: the SDK accepts the body in **camelCase** property names and
 * serialises to snake_case on the wire itself. If we send snake_case keys
 * the SDK doesn't recognise them at all — it'll throw
 * `Missing required key "conversationConfig"` because what we labelled
 * `conversation_config` is invisible to the validator.
 *
 * `conversationConfig` is required on create, so we always include it
 * (even if empty) rather than gating it on field presence.
 */
function buildSdkRequest(
  config: Partial<AgentConfig>,
  ctx: { mode: 'create' | 'update' },
): Record<string, unknown> {
  const conversationConfig: Record<string, unknown> = {};
  const agentInner: Record<string, unknown> = {};

  if (config.firstMessage !== undefined) agentInner.firstMessage = config.firstMessage;
  if (config.language !== undefined) agentInner.language = config.language;
  else if (ctx.mode === 'create') agentInner.language = 'en';

  if (
    config.systemPrompt !== undefined ||
    config.llm !== undefined ||
    config.toolIds ||
    config.timezone !== undefined
  ) {
    const prompt: Record<string, unknown> = {};
    if (config.systemPrompt !== undefined) prompt.prompt = config.systemPrompt;
    if (config.llm !== undefined) prompt.llm = config.llm;
    if (config.temperature !== undefined) prompt.temperature = config.temperature;
    // Native field — drives the dashboard's "Timezone" display and the
    // model's internal time grounding. Distinct from the `business_timezone`
    // dynamic variable, which the prompt header reads via `{{...}}`.
    if (config.timezone !== undefined) prompt.timezone = config.timezone;
    if (config.toolIds) {
      // Always send the array (even empty) so an update can clear stale
      // toolIds — omitting the field would leave the previous list intact
      // and we'd hit the "Documents with ids {...} not found" error again.
      prompt.toolIds = config.toolIds;
    }
    agentInner.prompt = prompt;
  }

  if (config.dynamicVariables) {
    // ElevenLabs accepts `dynamicVariables.dynamicVariablePlaceholders`
    // (camelCase, serialised to snake_case). Each value is a string that
    // the agent's prompt may reference as `{{key}}`.
    agentInner.dynamicVariables = {
      dynamicVariablePlaceholders: config.dynamicVariables,
    };
  }

  if (Object.keys(agentInner).length > 0) conversationConfig.agent = agentInner;

  if (config.voiceId !== undefined || config.ttsModelId !== undefined) {
    const tts: Record<string, unknown> = {};
    if (config.voiceId !== undefined) tts.voiceId = config.voiceId;
    if (config.ttsModelId !== undefined) tts.modelId = config.ttsModelId;
    conversationConfig.tts = tts;
  }

  const body: Record<string, unknown> = {
    // Required on create; harmless on update.
    conversationConfig,
  };
  if (config.name !== undefined) body.name = config.name;
  return body;
}

/**
 * Creates a single standalone webhook tool in the user's ElevenLabs
 * workspace and returns its `tool_xxx` id. ElevenLabs requires every
 * field they declare in the JSON Schema to mirror in `request_body_schema`
 * (so the LLM knows what to fill in); we pass our `VoiceFlowTool`
 * parameters verbatim because they were already authored to that shape.
 *
 * Dynamic header values for built-in system variables (agent_id,
 * conversation_id) use the `{ variableName: 'system__...' }` envelope —
 * ElevenLabs substitutes them at call time before signing.
 */
export async function createTool(
  userId: string,
  tool: VoiceFlowTool,
): Promise<{ toolId: string }> {
  const client = await getElevenLabsClient(userId);
  try {
    const headers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tool.webhook.headers)) {
      const match = typeof v === 'string' ? v.match(/^\{\{(system__[\w]+)\}\}$/) : null;
      headers[k] = match ? { variableName: match[1] } : v;
    }

    const body = {
      toolConfig: {
        type: 'webhook',
        name: tool.name,
        description: tool.description,
        apiSchema: {
          url: tool.webhook.url,
          method: tool.webhook.method,
          requestHeaders: headers,
          requestBodySchema: tool.parameters,
        },
      },
    };

    const res = await client.conversationalAi.tools.create(
      body as unknown as Parameters<typeof client.conversationalAi.tools.create>[0],
    );
    const toolId = pickToolId(res);
    if (!toolId) {
      throw new ExternalServiceError(
        'ElevenLabs',
        `Tool ${tool.name} created but no tool_id was returned.`,
      );
    }
    return { toolId };
  } catch (e) {
    throw toExternalError(e, `create tool ${tool.name}`);
  }
}

/**
 * Updates an existing workspace tool in place. Same body shape as
 * `createTool` — the SDK reuses `toolConfig` for both. Used by the
 * resync flow to avoid churning fresh `tool_xxx` IDs every time.
 */
export async function updateTool(
  userId: string,
  toolId: string,
  tool: VoiceFlowTool,
): Promise<void> {
  const client = await getElevenLabsClient(userId);
  try {
    const headers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tool.webhook.headers)) {
      const match = typeof v === 'string' ? v.match(/^\{\{(system__[\w]+)\}\}$/) : null;
      headers[k] = match ? { variableName: match[1] } : v;
    }
    const body = {
      toolConfig: {
        type: 'webhook',
        name: tool.name,
        description: tool.description,
        apiSchema: {
          url: tool.webhook.url,
          method: tool.webhook.method,
          requestHeaders: headers,
          requestBodySchema: tool.parameters,
        },
      },
    };
    await client.conversationalAi.tools.update(
      toolId,
      body as unknown as Parameters<typeof client.conversationalAi.tools.update>[1],
    );
  } catch (e) {
    throw toExternalError(e, `update tool ${tool.name}`);
  }
}

/**
 * Best-effort delete of a workspace tool. Used during agent deletion
 * and re-sync; any failure is swallowed because an orphaned tool in
 * the user's workspace is annoying but not catastrophic.
 */
export async function deleteTool(userId: string, toolId: string): Promise<{ ok: boolean }> {
  try {
    const client = await getElevenLabsClient(userId);
    await client.conversationalAi.tools.delete(toolId, { force: true });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function pickToolId(res: unknown): string | null {
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if (typeof r.id === 'string') return r.id;
    if (typeof r.tool_id === 'string') return r.tool_id;
    if (typeof r.toolId === 'string') return r.toolId;
  }
  return null;
}

function pickAgentId(res: unknown): string | null {
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if (typeof r.agent_id === 'string') return r.agent_id;
    if (typeof r.agentId === 'string') return r.agentId;
  }
  return null;
}

function pickSignedUrl(res: unknown): string | null {
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if (typeof r.signed_url === 'string') return r.signed_url;
    if (typeof r.signedUrl === 'string') return r.signedUrl;
  }
  return null;
}

function toExternalError(e: unknown, action: string): ExternalServiceError {
  const reason = e instanceof Error ? e.message : 'unknown error';
  return new ExternalServiceError('ElevenLabs', `Failed to ${action}: ${reason}`, hintFor(reason, action));
}

/**
 * Maps known ElevenLabs error patterns to a user-friendly hint. We only
 * surface a hint when we're confident the user can act on it — otherwise
 * we let the generic "temporarily unavailable" copy stand (the technical
 * detail still lands in the ErrorLog).
 */
function hintFor(reason: string, action: string): string | undefined {
  if (/English Agents must use turbo or flash v2/i.test(reason)) {
    return 'ElevenLabs requires English phone agents to use Standard mode (turbo/flash v2). Disable Expressive Mode or change the agent language.';
  }
  if (/voice_id|voice not found/i.test(reason)) {
    return 'The selected voice is not available on your ElevenLabs account.';
  }
  if (/quota|character.*limit|usage.*exceeded/i.test(reason)) {
    return 'Your ElevenLabs character quota is exhausted. Upgrade your ElevenLabs plan to continue.';
  }
  if (/invalid api key|unauthori[sz]ed|401|403/i.test(reason)) {
    return 'Your ElevenLabs API key seems invalid or rotated. Reconnect from Integrations.';
  }
  // Fall through — no specific hint, the generic ExternalServiceError copy
  // will be used. action is in the log already.
  void action;
  return undefined;
}
