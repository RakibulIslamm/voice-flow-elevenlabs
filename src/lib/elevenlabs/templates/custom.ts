import 'server-only';
import type { Template, BusinessInfo } from './types';

/**
 * "Custom" template — the escape hatch. Exposes every tool and provides
 * a permissive baseline prompt that the operator can fully replace in
 * the wizard's advanced mode. We keep just enough scaffolding here to
 * avoid completely lobotomised agents when an operator leaves the
 * defaults intact.
 */
const defaultFAQ = [
  'You are a custom-configured agent. Follow the operator\'s system prompt closely — it has the specific instructions for this business.',
  'Default behaviour: short replies, one question at a time, contractions, no medical/legal/financial advice.',
] as const;

function buildSystemPrompt(info: BusinessInfo): string {
  return [
    `You are an AI voice agent for ${info.name}.`,
    `This is a "custom" template — the operator may replace this prompt entirely. The text below is the safe default.`,
    ``,
    `## Default behaviour`,
    `- Keep replies to 1-2 sentences. One question at a time.`,
    `- Use contractions. Speak naturally — never robotic.`,
    `- Confirm key details (name, dates, contact info) by repeating them back.`,
    `- If you don't know, say so. Offer to take a message or transfer.`,
    ``,
    `## Always-on safety rails`,
    `- Don't give medical, legal, or financial advice. Defer to a professional.`,
    `- Don't quote firm prices unless you're certain.`,
    `- Don't sign contracts or commit to dates without confirmation.`,
    `- If a caller is in distress (medical, safety), call transfer_to_human immediately.`,
    ``,
    `## Tools available`,
    `- check_availability: see open dates/times.`,
    `- book_appointment: schedule a 1:1.`,
    `- book_reservation: book a restaurant table.`,
    `- log_lead: capture sales lead details.`,
    `- transfer_to_human: escalate to a teammate via email.`,
    ``,
    info.hours ? `## Hours\n${info.hours}` : '',
    info.address ? `## Address\n${info.address}` : '',
    info.humanPhone
      ? `## Human contact\nIf transfer is requested, a teammate will be reached at ${info.humanPhone}.`
      : '',
    info.extraContext ? `## Operator context\n${info.extraContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildGreeting(info: BusinessInfo): string {
  return `Hi, you've reached ${info.name}. How can I help you today?`;
}

export const customTemplate: Template = {
  key: 'custom',
  availableToolNames: [
    'check_availability',
    'book_appointment',
    'book_reservation',
    'log_lead',
    'transfer_to_human',
  ],
  buildSystemPrompt,
  buildGreeting,
  defaultFAQ,
};
