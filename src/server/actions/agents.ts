'use server';

import { z } from 'zod';
import { Types } from 'mongoose';
import { safeAction } from '@/lib/safe-action';
import { requireUser } from '@/lib/auth/guards';
import { connectDb } from '@/lib/db/connect';
import { Agent } from '@/lib/db/models/agent';
import { User, type UserDoc } from '@/lib/db/models/user';
import { QuotaExceededError, ExternalServiceError } from '@/lib/errors';
import { requireElevenLabsConnection } from '@/lib/elevenlabs/require';
import {
  createAgent as createElevenLabsAgent,
  deleteAgent as deleteElevenLabsAgent,
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
