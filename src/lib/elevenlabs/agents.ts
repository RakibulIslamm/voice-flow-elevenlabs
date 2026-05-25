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
  /** Webhook tools the agent can call mid-conversation. */
  tools?: VoiceFlowTool[];
  /** ISO 639-1 ASR/TTS language code. Defaults to 'en'. */
  language?: string;
  /** 0-1; lower = more deterministic. Defaults to the SDK's default. */
  temperature?: number;
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
 * Centralises the shape mapping so when ElevenLabs renames a field we only
 * patch one place.
 *
 * The SDK currently expects:
 *   { conversation_config: { agent: { first_message, language, prompt: {...} },
 *                            tts: { voice_id }, ... },
 *     name }
 * Earlier versions split this across `agent_config` + `conversation_config`.
 * We keep this isolated and untyped (cast at call site) for resilience.
 */
function buildSdkRequest(
  config: Partial<AgentConfig>,
  ctx: { mode: 'create' | 'update' },
): Record<string, unknown> {
  const conversationConfig: Record<string, unknown> = {};
  const agentInner: Record<string, unknown> = {};

  if (config.firstMessage !== undefined) agentInner.first_message = config.firstMessage;
  if (config.language !== undefined) agentInner.language = config.language;
  else if (ctx.mode === 'create') agentInner.language = 'en';

  if (config.systemPrompt !== undefined || config.llm !== undefined || config.tools) {
    const prompt: Record<string, unknown> = {};
    if (config.systemPrompt !== undefined) prompt.prompt = config.systemPrompt;
    if (config.llm !== undefined) prompt.llm = config.llm;
    if (config.temperature !== undefined) prompt.temperature = config.temperature;
    if (config.tools && config.tools.length > 0) {
      prompt.tools = config.tools.map(toSdkTool);
    }
    agentInner.prompt = prompt;
  }

  if (Object.keys(agentInner).length > 0) conversationConfig.agent = agentInner;

  if (config.voiceId !== undefined) {
    conversationConfig.tts = { voice_id: config.voiceId };
  }

  const body: Record<string, unknown> = {};
  if (config.name !== undefined) body.name = config.name;
  if (Object.keys(conversationConfig).length > 0) {
    body.conversation_config = conversationConfig;
  }
  return body;
}

function toSdkTool(tool: VoiceFlowTool): Record<string, unknown> {
  return {
    type: 'webhook',
    name: tool.name,
    description: tool.description,
    api_schema: {
      url: tool.webhook.url,
      method: tool.webhook.method,
      request_headers: tool.webhook.headers,
    },
    parameters: tool.parameters,
  };
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
  const message = e instanceof Error ? e.message : 'unknown error';
  return new ExternalServiceError('ElevenLabs', `Failed to ${action}: ${message}`);
}
