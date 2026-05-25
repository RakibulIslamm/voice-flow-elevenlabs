import type { VoiceFlowToolName } from '../tools';

/**
 * Business info collected during the agent wizard. Templates use this to
 * personalise system prompts and greetings without hard-coding the
 * business name everywhere.
 */
export type BusinessInfo = {
  /** Display name of the business, e.g. "Sunrise Dental". */
  name: string;
  /** Owner / receptionist persona used by the agent, e.g. "Sam". */
  agentName?: string;
  /** Human-readable hours, e.g. "Mon-Fri 9-5, Sat 10-2". */
  hours?: string;
  /** Physical address (used when callers ask for directions). */
  address?: string;
  /** Phone number a human can answer when the AI transfers. */
  humanPhone?: string;
  /** Free-form context the operator wants the agent to know. */
  extraContext?: string;
};

export type Template = {
  key: 'dental' | 'restaurant' | 'lead-qualifier' | 'custom';
  /** Tools available to agents built from this template. */
  availableToolNames: readonly VoiceFlowToolName[];
  /** Build the system prompt with the operator's business info merged in. */
  buildSystemPrompt: (info: BusinessInfo) => string;
  /** Build the opening line the agent speaks when the call connects. */
  buildGreeting: (info: BusinessInfo) => string;
  /** Default FAQ injected as preamble — short bullets the agent should know. */
  defaultFAQ: readonly string[];
};
