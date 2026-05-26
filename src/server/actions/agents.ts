'use server';

import { z } from 'zod';
import { Types } from 'mongoose';
import { safeAction } from '@/lib/safe-action';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { Agent, type AgentStatus } from '@/lib/db/models/agent';
import { User, type UserDoc } from '@/lib/db/models/user';
import {
  QuotaExceededError,
  ExternalServiceError,
  NotFoundError,
  AppError,
} from '@/lib/errors';
import { requireElevenLabsConnection } from '@/lib/elevenlabs/require';
import {
  createAgent as createElevenLabsAgent,
  deleteAgent as deleteElevenLabsAgent,
  updateAgent as updateElevenLabsAgent,
  getAgent as getElevenLabsAgent,
  createTool as createElevenLabsTool,
  updateTool as updateElevenLabsTool,
  deleteTool as deleteElevenLabsTool,
  type AgentConfig,
} from '@/lib/elevenlabs/agents';
import { getToolsForTemplate, type TemplateKey, type VoiceFlowTool } from '@/lib/elevenlabs/tools';
import { getTemplate, type BusinessInfo } from '@/lib/elevenlabs/templates';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';

const TEMPLATES = ['dental', 'restaurant', 'lead-qualifier', 'custom'] as const;
const TONES = ['professional', 'friendly', 'casual'] as const;

/**
 * TTS model id ElevenLabs uses when Expressive Mode is enabled. Maps to
 * `conversation_config.tts.model_id`. Passing `undefined` leaves whatever
 * model the agent already has — important because ElevenLabs picks the
 * workspace default at create time and we don't want to override it.
 */
const EXPRESSIVE_TTS_MODEL = 'eleven_v3_conversational';
const STANDARD_TTS_MODEL = 'eleven_turbo_v2_5';
function ttsModelFor(expressive: boolean): string {
  return expressive ? EXPRESSIVE_TTS_MODEL : STANDARD_TTS_MODEL;
}

const faqEntrySchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});

// Closed days legitimately have no `open`/`close`. The wizard's <input
// type="time"> still emits an empty string when disabled, so we preprocess
// `''` → undefined before the regex check fires.
const timeOpt = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().regex(/^\d{2}:\d{2}$/).optional(),
);

const businessHoursDaySchema = z.object({
  open: timeOpt,
  close: timeOpt,
  closed: z.boolean().default(false),
});

const businessHoursSchema = z
  .object({
    mon: businessHoursDaySchema.optional(),
    tue: businessHoursDaySchema.optional(),
    wed: businessHoursDaySchema.optional(),
    thu: businessHoursDaySchema.optional(),
    fri: businessHoursDaySchema.optional(),
    sat: businessHoursDaySchema.optional(),
    sun: businessHoursDaySchema.optional(),
  })
  .optional();

// Not exported — files with `'use server'` may only export async functions.
// If the wizard ever needs to share the schema with the client, move it to
// a sibling `agent-schemas.ts` without `'use server'`.
const createAgentInputSchema = z.object({
  template: z.enum(TEMPLATES),
  // Step 2
  businessName: z.string().trim().min(1).max(80),
  businessHours: businessHoursSchema,
  businessTimezone: z.string().trim().min(1).max(80).default('UTC'),
  location: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).url().optional().or(z.literal('').transform(() => undefined)),
  // Step 3
  agentName: z.string().trim().min(1).max(40),
  greeting: z.string().trim().min(1).max(200),
  voiceId: z.string().trim().min(1),
  tonePreset: z.enum(TONES),
  expressiveMode: z.boolean().default(false),
  // Step 4
  faq: z.array(faqEntrySchema).max(100),
  // Step 5
  systemPrompt: z.string().trim().min(1).max(12_000),
  // Step 6
  publicSlug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain a-z, 0-9, and dashes.'),
  allowedDomains: z.array(z.string().trim().min(1)).max(20),
});

// `type CreateAgentInput = z.infer<typeof createAgentInputSchema>` removed —
// 'use server' files should only export async functions. Internal type
// inference at the call site is enough; nothing outside this file needs
// the named type.

const FREE_AGENT_LIMIT = 1;

export const createAgent = safeAction(createAgentInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  // Re-check ElevenLabs connection — defends against the (rare) case
  // where the user disconnects between starting the wizard and submitting.
  await requireElevenLabsConnection(userId);

  await connectDb();

  // 1. Plan quota. Hardcoded here; Phase 13 swaps in real plan limits.
  const user = await User.findById(userId).select('plan email').lean<
    Pick<UserDoc, '_id' | 'email' | 'plan'> | null
  >();
  if (!user) {
    throw new QuotaExceededError('Account not found.');
  }
  if (user.plan === 'free') {
    const existing = await Agent.countDocuments({ userId });
    if (existing >= FREE_AGENT_LIMIT) {
      throw new QuotaExceededError(
        'Free plan allows 1 agent. Upgrade to add more.',
      );
    }
  }

  // 2. Ensure slug is unique (race-safe via the unique index on publicSlug).
  const slug = await ensureUniqueSlug(input.publicSlug);

  // 3. Build the agent config for ElevenLabs. Note: the templates produce
  //    a *baseline* prompt; the wizard ships the operator's edited prompt
  //    in `input.systemPrompt`, so we trust that as the source of truth.
  const tools = getToolsForTemplate(input.template as TemplateKey);
  const agentNameInElevenLabs = `${user.email}: ${input.agentName}`;

  // 4. Provision tool resources in the user's workspace first; the agent
  //    needs the resulting tool IDs to wire them in via `prompt.toolIds`.
  //    If any tool create fails, roll back the ones we did create so we
  //    don't leave orphans in their dashboard.
  const toolRefs = await createToolBatch(userId, tools);
  const toolIds = toolRefs.map((t) => t.id);

  // 5. Provision the agent itself. If this throws AFTER tool creates,
  //    clean up the tools too.
  let elevenLabsAgentId: string;
  try {
    const res = await createElevenLabsAgent(userId, {
      name: agentNameInElevenLabs,
      voiceId: input.voiceId,
      firstMessage: input.greeting,
      systemPrompt: input.systemPrompt,
      llm: 'gemini-2.5-flash',
      toolIds,
      dynamicVariables: { business_timezone: input.businessTimezone },
      ttsModelId: ttsModelFor(input.expressiveMode),
    });
    elevenLabsAgentId = res.agentId;
  } catch (e) {
    await deleteToolBatch(userId, toolIds);
    throw e;
  }

  // 6. Persist locally. If this fails AFTER ElevenLabs succeeded, we
  //    have orphans on their side — best-effort rollback below.
  try {
    const doc = await Agent.create({
      userId,
      name: input.agentName,
      template: input.template,
      businessName: input.businessName,
      businessAddress: input.location,
      businessPhone: input.phone,
      businessWebsite: input.website,
      businessTimezone: input.businessTimezone,
      businessHours: input.businessHours,
      faq: input.faq,
      elevenLabsAgentId,
      elevenLabsTools: toolRefs,
      voiceId: input.voiceId,
      expressiveMode: input.expressiveMode,
      greeting: input.greeting,
      systemPrompt: input.systemPrompt,
      tonePreset: input.tonePreset,
      status: 'active',
      channels: {
        browser: {
          enabled: true,
          publicSlug: slug,
          allowedDomains: input.allowedDomains,
        },
        phone: { enabled: false },
      },
    });

    void trackEvent('agent.created', {
      userId,
      agentId: doc._id,
      properties: { template: input.template },
    });

    return { agentId: doc._id.toString() };
  } catch (e) {
    void logError(
      e,
      {
        scope: 'createAgent',
        stage: 'mongo-after-elevenlabs',
        userId,
        elevenLabsAgentId,
        slug,
      },
      { severity: 'high' },
    );

    // Best-effort cleanup: delete agent + tools so we don't leave orphans.
    const cleanup = await deleteElevenLabsAgent(userId, elevenLabsAgentId);
    if (!cleanup.ok) {
      void logError(
        new Error('Failed to clean up orphaned ElevenLabs agent'),
        { scope: 'createAgent', elevenLabsAgentId, reason: cleanup.reason },
        { severity: 'high' },
      );
    }
    await deleteToolBatch(userId, toolIds);

    throw new ExternalServiceError(
      'VoiceFlow',
      'We provisioned your agent on ElevenLabs but couldn\'t save it. Please try again.',
    );
  }
});

type ToolRef = { name: string; id: string };

/**
 * Fresh batch create — used at agent creation time. Rolls back any
 * partially-created tools if a later create throws.
 */
async function createToolBatch(userId: string, tools: VoiceFlowTool[]): Promise<ToolRef[]> {
  const created: ToolRef[] = [];
  try {
    for (const tool of tools) {
      const { toolId } = await createElevenLabsTool(userId, tool);
      created.push({ name: tool.name, id: toolId });
    }
    return created;
  } catch (e) {
    await deleteToolBatch(
      userId,
      created.map((c) => c.id),
    );
    throw e;
  }
}

async function deleteToolBatch(userId: string, toolIds: string[]): Promise<void> {
  await Promise.all(toolIds.map((id) => deleteElevenLabsTool(userId, id)));
}

/**
 * Reconcile a desired tool catalog against the agent's existing tool
 * refs. Updates tools that still exist (same name) in place, creates
 * new ones, and deletes the ones that fell out of the catalog. Returns
 * the new full ref list to persist on the agent doc.
 *
 * Best-effort: an update failure falls back to delete + create so a
 * tool whose underlying doc was deleted out-of-band in the ElevenLabs
 * dashboard still re-syncs cleanly. We don't try to recover from
 * partial state — caller logs the error and the user can retry.
 */
async function reconcileTools(
  userId: string,
  desiredTools: VoiceFlowTool[],
  existing: ToolRef[],
): Promise<{ refs: ToolRef[]; orphanedIds: string[] }> {
  const existingByName = new Map(existing.map((r) => [r.name, r.id] as const));
  const desiredNames = new Set<string>(desiredTools.map((t) => t.name));
  const refs: ToolRef[] = [];

  for (const tool of desiredTools) {
    const existingId = existingByName.get(tool.name);
    if (existingId) {
      try {
        await updateElevenLabsTool(userId, existingId, tool);
        refs.push({ name: tool.name, id: existingId });
        continue;
      } catch {
        // Update failed — likely the doc was deleted out-of-band. Fall
        // through to create a fresh one.
      }
    }
    const { toolId } = await createElevenLabsTool(userId, tool);
    refs.push({ name: tool.name, id: toolId });
  }

  const orphanedIds = existing
    .filter((r) => !desiredNames.has(r.name))
    .map((r) => r.id);

  return { refs, orphanedIds };
}

/**
 * Helper to expose template-derived defaults to the wizard without
 * forcing the client to import server-only template modules.
 */
const previewSchema = z.object({
  template: z.enum(TEMPLATES),
  businessInfo: z.object({
    name: z.string().trim().min(1).max(80),
    agentName: z.string().trim().min(1).max(40).optional(),
    hours: z.string().trim().max(500).optional(),
    address: z.string().trim().max(200).optional(),
    humanPhone: z.string().trim().max(40).optional(),
    extraContext: z.string().trim().max(2000).optional(),
  }),
  tonePreset: z.enum(TONES),
});

/**
 * Returns a baseline system prompt + greeting + default FAQ for the
 * given template, with a tone modifier appended. Called from the wizard
 * when the user clicks "Reset to template default" or when business
 * info changes upstream.
 */
export const buildTemplateDefaults = safeAction(previewSchema, async (input) => {
  const template = getTemplate(input.template);
  const info: BusinessInfo = {
    name: input.businessInfo.name,
    agentName: input.businessInfo.agentName,
    hours: input.businessInfo.hours,
    address: input.businessInfo.address,
    humanPhone: input.businessInfo.humanPhone,
    extraContext: input.businessInfo.extraContext,
  };
  const basePrompt = template.buildSystemPrompt(info);
  const toneNote = toneInstruction(input.tonePreset);
  const systemPrompt = toneNote ? `${basePrompt}\n\n## Tone preset\n${toneNote}` : basePrompt;
  return {
    systemPrompt,
    greeting: template.buildGreeting(info),
    defaultFAQ: template.defaultFAQ.map((q) => ({ question: q, answer: '' })),
  };
});

function toneInstruction(t: 'professional' | 'friendly' | 'casual'): string {
  switch (t) {
    case 'professional':
      return 'Stay polite and concise. Use proper grammar. Don\'t use slang or filler words.';
    case 'friendly':
      return 'Be warm and personable. A little humour is fine. Use the caller\'s name when you know it.';
    case 'casual':
      return 'Speak the way a friend would. Contractions, short sentences, the occasional "yeah" or "no worries" is OK.';
  }
}

async function ensureUniqueSlug(requested: string): Promise<string> {
  const base = requested.replace(/^-+|-+$/g, '');
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix(4 + attempt)}`;
    const existing = await Agent.exists({ 'channels.browser.publicSlug': slug });
    if (!existing) return slug;
  }
  // Last resort: prefix with the date to all but guarantee uniqueness.
  return `${base}-${Date.now().toString(36)}`;
}

function randomSuffix(len: number): string {
  const id = new Types.ObjectId().toString();
  return id.slice(-len);
}

function makeSlug(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base || 'agent';
}

// ---------------------------------------------------------------------------
// Edit / update flows
// ---------------------------------------------------------------------------

const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Invalid agent ID.');

const updateAgentInputSchema = z.object({
  agentId: objectIdSchema,
  // Basic info
  name: z.string().trim().min(1).max(40).optional(),
  businessName: z.string().trim().min(1).max(80).optional(),
  businessAddress: z.string().trim().max(200).optional(),
  businessPhone: z.string().trim().max(40).optional(),
  businessWebsite: z
    .string()
    .trim()
    .max(200)
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  businessTimezone: z.string().trim().min(1).max(80).optional(),
  businessHours: businessHoursSchema,
  faq: z.array(faqEntrySchema).max(100).optional(),
  // Voice / personality
  greeting: z.string().trim().min(1).max(200).optional(),
  systemPrompt: z.string().trim().min(1).max(12_000).optional(),
  tonePreset: z.enum(TONES).optional(),
  expressiveMode: z.boolean().optional(),
});

export const updateAgent = safeAction(updateAgentInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);

  // We sync any voice-facing field changes to ElevenLabs first. If their
  // API rejects the patch, we leave Mongo untouched — the local doc stays
  // consistent with what's actually live in their account.
  await requireElevenLabsConnection(userId);

  const elPatch: Partial<AgentConfig> = {};
  if (input.name !== undefined) {
    const owner = await User.findById(userId)
      .select('email')
      .lean<{ email: string } | null>();
    elPatch.name = owner ? `${owner.email}: ${input.name}` : input.name;
  }
  if (input.greeting !== undefined) elPatch.firstMessage = input.greeting;
  if (input.systemPrompt !== undefined) elPatch.systemPrompt = input.systemPrompt;
  if (input.businessTimezone !== undefined) {
    elPatch.dynamicVariables = { business_timezone: input.businessTimezone };
  }
  if (input.expressiveMode !== undefined) {
    elPatch.ttsModelId = ttsModelFor(input.expressiveMode);
  }

  if (Object.keys(elPatch).length > 0) {
    await updateElevenLabsAgent(userId, agent.elevenLabsAgentId, elPatch);
  }

  if (input.name !== undefined) agent.name = input.name;
  if (input.businessName !== undefined) agent.businessName = input.businessName;
  if (input.businessAddress !== undefined) agent.businessAddress = input.businessAddress;
  if (input.businessPhone !== undefined) agent.businessPhone = input.businessPhone;
  if (input.businessWebsite !== undefined) agent.businessWebsite = input.businessWebsite;
  if (input.businessTimezone !== undefined) agent.businessTimezone = input.businessTimezone;
  if (input.businessHours !== undefined) agent.businessHours = input.businessHours;
  if (input.faq !== undefined) agent.faq = input.faq;
  if (input.greeting !== undefined) agent.greeting = input.greeting;
  if (input.systemPrompt !== undefined) agent.systemPrompt = input.systemPrompt;
  if (input.tonePreset !== undefined) agent.tonePreset = input.tonePreset;
  if (input.expressiveMode !== undefined) agent.expressiveMode = input.expressiveMode;

  await agent.save();

  const touched = Object.keys(input).filter((k) => k !== 'agentId');
  void trackEvent('agent.updated', {
    userId,
    agentId: agent._id.toString(),
    properties: { fields: touched },
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const deleteAgentInputSchema = z.object({
  agentId: objectIdSchema,
  // Defence-in-depth: the AlertDialog forces the user to type the agent
  // name. We re-check it server-side so a CSRF-ish "click delete" can't
  // succeed without the user knowing the name.
  confirmName: z.string().trim().min(1),
});

export const deleteAgent = safeAction(deleteAgentInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);

  if (input.confirmName !== agent.name) {
    throw new AppError({
      code: 'CONFIRMATION_MISMATCH',
      statusCode: 400,
      publicMessage: 'The name you typed does not match this agent.',
    });
  }

  // Best-effort cleanup on the user's ElevenLabs account. We skip the call
  // entirely when they're disconnected — orphaned agents in their EL
  // dashboard aren't billed when idle and they can clean up later.
  const user = await User.findById(userId)
    .select('integrations.elevenlabs.enabled integrations.twilio.enabled')
    .lean<{ integrations?: { elevenlabs?: { enabled?: boolean }; twilio?: { enabled?: boolean } } } | null>();
  const elConnected = !!user?.integrations?.elevenlabs?.enabled;

  if (elConnected) {
    const cleanup = await deleteElevenLabsAgent(userId, agent.elevenLabsAgentId);
    if (!cleanup.ok) {
      void logError(
        new Error('ElevenLabs delete failed during agent delete'),
        {
          scope: 'deleteAgent',
          agentId: agent._id.toString(),
          elevenLabsAgentId: agent.elevenLabsAgentId,
          reason: cleanup.reason,
        },
        { severity: 'medium' },
      );
    }

    if (agent.elevenLabsPhoneAgentId) {
      const phoneCleanup = await deleteElevenLabsAgent(userId, agent.elevenLabsPhoneAgentId);
      if (!phoneCleanup.ok) {
        void logError(
          new Error('ElevenLabs phone-agent delete failed'),
          {
            scope: 'deleteAgent',
            agentId: agent._id.toString(),
            elevenLabsPhoneAgentId: agent.elevenLabsPhoneAgentId,
            reason: phoneCleanup.reason,
          },
          { severity: 'medium' },
        );
      }
    }

    // Clean up the standalone tool documents the agent depended on.
    await deleteToolBatch(userId, (agent.elevenLabsTools ?? []).map((t) => t.id));
  } else {
    void trackEvent('agent.delete.skip_elevenlabs', {
      userId,
      agentId: agent._id.toString(),
      properties: { reason: 'integration_disconnected' },
    });
  }

  // Twilio webhook cleanup lands in Phase 12 — placeholder hook for now.
  // if (agent.channels.phone.enabled) { … }

  await agent.deleteOne();

  void trackEvent('agent.deleted', {
    userId,
    agentId: agent._id.toString(),
    properties: { hadPhone: !!agent.elevenLabsPhoneAgentId, elConnected },
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Slug regeneration
// ---------------------------------------------------------------------------

const regenerateSlugInputSchema = z.object({ agentId: objectIdSchema });

export const regenerateAgentSlug = safeAction(regenerateSlugInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);

  const base = makeSlug(agent.name || agent.businessName || 'agent');
  const slug = await ensureUniqueSlug(base);
  agent.channels.browser.publicSlug = slug;
  await agent.save();

  void trackEvent('agent.slug_regenerated', {
    userId,
    agentId: agent._id.toString(),
    properties: { slug },
  });

  return { publicSlug: slug };
});

// ---------------------------------------------------------------------------
// Allowed domains
// ---------------------------------------------------------------------------

// Hostname pattern — labels of a-z 0-9 and hyphens (not leading/trailing),
// dot-separated. We strip protocol and trailing slash before validating so
// the user can paste either `example.com` or `https://example.com/`.
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const LOCALHOST_RE = /^localhost(?::\d+)?$/i;

const allowedDomainsInputSchema = z.object({
  agentId: objectIdSchema,
  domains: z
    .array(
      z
        .string()
        .trim()
        .transform((v) => v.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''))
        .refine((v) => HOSTNAME_RE.test(v) || LOCALHOST_RE.test(v), {
          message: 'Each domain must be a valid hostname (no protocol, no path).',
        }),
    )
    .max(20),
});

export const updateAllowedDomains = safeAction(allowedDomainsInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);

  // Dedupe (case-insensitive). We store the lowercased form so widget
  // origin checks at request time can compare without re-normalising.
  const seen = new Set<string>();
  const normalised: string[] = [];
  for (const d of input.domains) {
    const lower = d.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    normalised.push(lower);
  }

  agent.channels.browser.allowedDomains = normalised;
  await agent.save();

  void trackEvent('agent.allowed_domains_updated', {
    userId,
    agentId: agent._id.toString(),
    properties: { count: normalised.length },
  });

  return { allowedDomains: normalised };
});

// ---------------------------------------------------------------------------
// Status toggle + re-activation
// ---------------------------------------------------------------------------

const setStatusInputSchema = z.object({
  agentId: objectIdSchema,
  status: z.enum(['active', 'paused']),
});

export const setAgentStatus = safeAction(setStatusInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);

  // Pausing is always allowed — the agent just stops accepting new calls
  // at the widget edge. Activation routes through the verification path
  // so we don't silently re-enable a missing/broken EL agent.
  if (input.status === 'active') {
    return runReactivate(userId, agent);
  }

  agent.status = 'paused';
  await agent.save();

  void trackEvent('agent.paused', { userId, agentId: agent._id.toString() });
  return { status: 'paused' as AgentStatus };
});

const reactivateInputSchema = z.object({ agentId: objectIdSchema });

export const reactivateAgent = safeAction(reactivateInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);
  return runReactivate(userId, agent);
});

type OwnedAgent = Awaited<ReturnType<typeof loadOwnedAgent>>;

async function runReactivate(userId: string, agent: OwnedAgent) {
  await requireElevenLabsConnection(userId);

  const { exists } = await getElevenLabsAgent(userId, agent.elevenLabsAgentId);
  if (!exists) {
    // Sticky failure state — the local Agent doc is now out of sync with
    // their ElevenLabs account in a way the user can't recover from
    // without deleting the VoiceFlow record.
    agent.status = 'error';
    await agent.save();
    throw new AppError({
      code: 'AGENT_GONE',
      statusCode: 410,
      publicMessage:
        'This agent no longer exists in your ElevenLabs account. Please delete it from VoiceFlow and create a new one.',
    });
  }

  agent.status = 'active';
  await agent.save();

  void trackEvent('agent.reactivated', { userId, agentId: agent._id.toString() });
  return { status: 'active' as AgentStatus };
}

const resyncToolsInputSchema = z.object({ agentId: objectIdSchema });

/**
 * Re-creates the agent's webhook tool documents in the user's ElevenLabs
 * workspace and rewires the agent to use them. Needed because ElevenLabs
 * moved tools to first-class resources — old agents may reference tool
 * IDs that were deleted (or were never compatible with the current
 * schema), causing `document_not_found` errors.
 *
 * Flow:
 *   1. Create fresh tool docs with the current URL/header config.
 *   2. Update the agent to reference the new tool IDs (this also clears
 *      whatever stale IDs were cached on the ElevenLabs side).
 *   3. Save the new IDs to our DB.
 *   4. Best-effort delete the previous tool IDs we knew about, so we
 *      don't leave orphans in the user's workspace.
 *
 * If any step before (3) fails, we clean up the freshly-created tools so
 * we don't leak resources.
 */
export const resyncAgentTools = safeAction(resyncToolsInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);
  await requireElevenLabsConnection(userId);

  const desiredTools = getToolsForTemplate(agent.template as TemplateKey);
  const existing = (agent.elevenLabsTools ?? []).map((t) => ({ name: t.name, id: t.id }));

  // Step 1: reconcile — update in place where possible, create only new
  // names, surface orphans for cleanup.
  let refs: ToolRef[];
  let orphanedIds: string[];
  try {
    const result = await reconcileTools(userId, desiredTools, existing);
    refs = result.refs;
    orphanedIds = result.orphanedIds;
  } catch (e) {
    void logError(e, {
      scope: 'resyncAgentTools',
      stage: 'reconcile-tools',
      agentId: agent._id.toString(),
    });
    throw new ExternalServiceError(
      'ElevenLabs',
      'Failed to sync tool resources. Please try again.',
    );
  }

  // Step 2: point the agent at the (possibly unchanged) tool ID list.
  // We always send to clear stale `toolIds` cached on ElevenLabs side.
  try {
    await updateElevenLabsAgent(userId, agent.elevenLabsAgentId, {
      toolIds: refs.map((r) => r.id),
    });
  } catch (e) {
    void logError(e, {
      scope: 'resyncAgentTools',
      stage: 'update-agent',
      agentId: agent._id.toString(),
    });
    throw new ExternalServiceError(
      'ElevenLabs',
      'Failed to re-sync tool configuration. Please try again.',
    );
  }

  // Step 3: persist the merged refs.
  agent.elevenLabsTools = refs;
  await agent.save();

  // Step 4: best-effort delete the orphans (tools no longer in the catalog).
  await deleteToolBatch(userId, orphanedIds);

  void trackEvent('agent.tools_resynced', {
    userId,
    agentId: agent._id.toString(),
    properties: { toolCount: refs.length, orphansDeleted: orphanedIds.length },
  });

  return { ok: true as const, toolCount: refs.length };
});

const resyncSettingsInputSchema = z.object({ agentId: objectIdSchema });

/**
 * Re-pushes the agent's saved system prompt + dynamic variables to
 * ElevenLabs. Use when the date-grounding header (or the operator's
 * edited prompt) needs to land on a previously-created agent.
 *
 * Idempotent — safe to call repeatedly.
 */
export const resyncAgentSettings = safeAction(resyncSettingsInputSchema, async (input) => {
  const session = await requireUser();
  const userId = session.user.id;

  await connectDb();
  const agent = await loadOwnedAgent(input.agentId, userId);
  await requireElevenLabsConnection(userId);

  if (!agent.systemPrompt) {
    throw new AppError({
      code: 'MISSING_PROMPT',
      statusCode: 400,
      publicMessage: 'This agent has no saved system prompt to re-sync.',
    });
  }

  try {
    await updateElevenLabsAgent(userId, agent.elevenLabsAgentId, {
      systemPrompt: agent.systemPrompt,
      firstMessage: agent.greeting,
      dynamicVariables: { business_timezone: agent.businessTimezone || 'UTC' },
      ttsModelId: ttsModelFor(agent.expressiveMode ?? false),
    });
  } catch (e) {
    void logError(e, {
      scope: 'resyncAgentSettings',
      agentId: agent._id.toString(),
    });
    throw new ExternalServiceError(
      'ElevenLabs',
      'Failed to re-sync agent settings. Please try again.',
    );
  }

  void trackEvent('agent.settings_resynced', {
    userId,
    agentId: agent._id.toString(),
  });

  return { ok: true as const };
});

// ---------------------------------------------------------------------------
// Internal: shared owner-lookup
// ---------------------------------------------------------------------------

async function loadOwnedAgent(agentId: string, userId: string) {
  const agent = await Agent.findById(agentId);
  if (!agent || agent.userId.toString() !== userId) {
    throw new NotFoundError('Agent not found.');
  }
  return agent;
}
