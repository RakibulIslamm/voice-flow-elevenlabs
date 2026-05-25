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
  type AgentConfig,
} from '@/lib/elevenlabs/agents';
import { getToolsForTemplate, type TemplateKey } from '@/lib/elevenlabs/tools';
import { getTemplate, type BusinessInfo } from '@/lib/elevenlabs/templates';
import { trackEvent } from '@/lib/tracking/event';
import { logError } from '@/lib/tracking/log-error';

const TEMPLATES = ['dental', 'restaurant', 'lead-qualifier', 'custom'] as const;
const TONES = ['professional', 'friendly', 'casual'] as const;

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
  location: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  // Step 3
  agentName: z.string().trim().min(1).max(40),
  greeting: z.string().trim().min(1).max(200),
  voiceId: z.string().trim().min(1),
  tonePreset: z.enum(TONES),
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

  // 4. Provision in the user's ElevenLabs account. If this throws, no DB
  //    write has happened — clean failure mode.
  const { agentId: elevenLabsAgentId } = await createElevenLabsAgent(userId, {
    name: agentNameInElevenLabs,
    voiceId: input.voiceId,
    firstMessage: input.greeting,
    systemPrompt: input.systemPrompt,
    llm: 'gemini-2.5-flash',
    tools,
  });

  // 5. Persist locally. If this fails AFTER ElevenLabs succeeded, we have
  //    an orphan in their dashboard — best-effort rollback below.
  try {
    const doc = await Agent.create({
      userId,
      name: input.agentName,
      template: input.template,
      businessName: input.businessName,
      businessHours: input.businessHours,
      faq: input.faq,
      elevenLabsAgentId,
      voiceId: input.voiceId,
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

    // Best-effort cleanup. `deleteAgent` already returns { ok } without throwing.
    const cleanup = await deleteElevenLabsAgent(userId, elevenLabsAgentId);
    if (!cleanup.ok) {
      void logError(
        new Error('Failed to clean up orphaned ElevenLabs agent'),
        { scope: 'createAgent', elevenLabsAgentId, reason: cleanup.reason },
        { severity: 'high' },
      );
    }

    throw new ExternalServiceError(
      'VoiceFlow',
      'We provisioned your agent on ElevenLabs but couldn\'t save it. Please try again.',
    );
  }
});

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
  businessHours: businessHoursSchema,
  faq: z.array(faqEntrySchema).max(100).optional(),
  // Voice / personality
  greeting: z.string().trim().min(1).max(200).optional(),
  systemPrompt: z.string().trim().min(1).max(12_000).optional(),
  tonePreset: z.enum(TONES).optional(),
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

  if (Object.keys(elPatch).length > 0) {
    await updateElevenLabsAgent(userId, agent.elevenLabsAgentId, elPatch);
  }

  if (input.name !== undefined) agent.name = input.name;
  if (input.businessName !== undefined) agent.businessName = input.businessName;
  if (input.businessHours !== undefined) agent.businessHours = input.businessHours;
  if (input.faq !== undefined) agent.faq = input.faq;
  if (input.greeting !== undefined) agent.greeting = input.greeting;
  if (input.systemPrompt !== undefined) agent.systemPrompt = input.systemPrompt;
  if (input.tonePreset !== undefined) agent.tonePreset = input.tonePreset;

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
