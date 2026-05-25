import 'server-only';
import { env } from '@/lib/env';

/**
 * Names of webhook tools VoiceFlow registers with each agent.
 *
 * The agent itself lives inside the user's ElevenLabs account, but the
 * tool webhooks point at **our** Next.js API — that's deliberate: tools
 * need to read/write MongoDB, create Captures, send Resend emails, and
 * count usage minutes, all of which require server access we control.
 */
export type VoiceFlowToolName =
  | 'check_availability'
  | 'book_appointment'
  | 'book_reservation'
  | 'log_lead'
  | 'transfer_to_human';

/**
 * Minimal JSON-schema dialect ElevenLabs accepts for tool parameters.
 * Anything object-shaped with `type: 'object'`, `properties`, `required`
 * works — but we keep it tight on purpose: the LLM does better with
 * narrow schemas and explicit string formats.
 */
export type ToolParameterSchema = {
  type: 'object';
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'integer' | 'boolean';
      description: string;
      enum?: readonly string[];
      format?: string;
    }
  >;
  required: readonly string[];
  additionalProperties?: false;
};

export type VoiceFlowTool = {
  name: VoiceFlowToolName;
  description: string;
  parameters: ToolParameterSchema;
  webhook: {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
  };
};

/** Names a per-template selection of tools (matches `templates/*.ts`). */
export type TemplateKey = 'dental' | 'restaurant' | 'lead-qualifier' | 'custom';

/**
 * Per-template tool catalog. `custom` gets everything; `dental` skips
 * `book_reservation` because that's a restaurant concept; etc.
 *
 * Keep these arrays in sync with the system prompts in `templates/*.ts`
 * — if you grant `book_appointment` here, the prompt should mention it.
 */
const TEMPLATE_TOOL_NAMES: Record<TemplateKey, readonly VoiceFlowToolName[]> = {
  dental: ['check_availability', 'book_appointment', 'transfer_to_human'],
  restaurant: ['check_availability', 'book_reservation', 'transfer_to_human'],
  'lead-qualifier': ['log_lead', 'transfer_to_human'],
  custom: [
    'check_availability',
    'book_appointment',
    'book_reservation',
    'log_lead',
    'transfer_to_human',
  ],
};

function toolUrl(name: VoiceFlowToolName): string {
  const base = (env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  // ElevenLabs substitutes `{{system__agent_id}}` and `{{system__conversation_id}}`
  // at call time. Tool webhooks DON'T carry an HMAC signature (only post-call
  // and personalization webhooks do), so we rely on the agent_id lookup to
  // authorise the dispatch. Passing the ids via query params guarantees they
  // arrive regardless of which body shape ElevenLabs sends.
  return (
    `${base}/api/elevenlabs/tools/${name}` +
    `?agent_id={{system__agent_id}}&conversation_id={{system__conversation_id}}`
  );
}

function defaultHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    // ElevenLabs forwards request headers verbatim from this map. We mirror
    // the ids into headers too so the handler can read them either way.
    'x-voiceflow-source': 'elevenlabs-tool',
    'x-elevenlabs-agent-id': '{{system__agent_id}}',
    'x-elevenlabs-conversation-id': '{{system__conversation_id}}',
  };
}

const TOOL_DEFINITIONS: Record<VoiceFlowToolName, () => VoiceFlowTool> = {
  check_availability: () => ({
    name: 'check_availability',
    description:
      'Check whether the business has openings on a given date. Use this BEFORE confirming any booking.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: "The date to check, in YYYY-MM-DD format (caller's local time).",
          format: 'date',
        },
      },
      required: ['date'],
      additionalProperties: false,
    },
    webhook: { url: toolUrl('check_availability'), method: 'POST', headers: defaultHeaders() },
  }),

  book_appointment: () => ({
    name: 'book_appointment',
    description:
      'Book an appointment after the caller has confirmed they want to proceed. Captures their contact details and the reason for the visit.',
    parameters: {
      type: 'object',
      properties: {
        caller_name: { type: 'string', description: "Caller's full name." },
        phone: { type: 'string', description: "Caller's phone number, with country code if known." },
        date: {
          type: 'string',
          description: 'Appointment date in YYYY-MM-DD format.',
          format: 'date',
        },
        time: {
          type: 'string',
          description: 'Appointment time in HH:MM 24-hour format.',
        },
        reason: {
          type: 'string',
          description: 'Short reason for the visit (e.g. "annual cleaning", "tooth pain").',
        },
      },
      required: ['caller_name', 'phone', 'date', 'time', 'reason'],
      additionalProperties: false,
    },
    webhook: { url: toolUrl('book_appointment'), method: 'POST', headers: defaultHeaders() },
  }),

  book_reservation: () => ({
    name: 'book_reservation',
    description:
      'Book a restaurant reservation after confirming details with the caller.',
    parameters: {
      type: 'object',
      properties: {
        caller_name: { type: 'string', description: "Diner's name the reservation will be under." },
        phone: { type: 'string', description: "Caller's phone number." },
        date: {
          type: 'string',
          description: 'Reservation date in YYYY-MM-DD format.',
          format: 'date',
        },
        time: { type: 'string', description: 'Reservation time in HH:MM 24-hour format.' },
        party_size: {
          type: 'integer',
          description: 'Number of guests, including the caller.',
        },
        special_requests: {
          type: 'string',
          description: 'Allergies, accessibility needs, or seating preferences. Optional.',
        },
      },
      required: ['caller_name', 'phone', 'date', 'time', 'party_size'],
      additionalProperties: false,
    },
    webhook: { url: toolUrl('book_reservation'), method: 'POST', headers: defaultHeaders() },
  }),

  log_lead: () => ({
    name: 'log_lead',
    description:
      'Record a sales lead after the caller has shared their details and use case. Use this when qualifying inbound interest, not for booking flows.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Lead's full name." },
        company: { type: 'string', description: 'Company name. Optional.' },
        email: { type: 'string', description: 'Work email address.', format: 'email' },
        phone: { type: 'string', description: 'Phone number. Optional.' },
        use_case: {
          type: 'string',
          description: 'One-sentence summary of what the lead is trying to solve.',
        },
        budget_range: {
          type: 'string',
          description: 'Approx. budget if mentioned (e.g. "under $500/mo"). Optional.',
        },
        timeline: {
          type: 'string',
          description: 'When they want to start (e.g. "this quarter"). Optional.',
        },
      },
      required: ['name', 'email', 'use_case'],
      additionalProperties: false,
    },
    webhook: { url: toolUrl('log_lead'), method: 'POST', headers: defaultHeaders() },
  }),

  transfer_to_human: () => ({
    name: 'transfer_to_human',
    description:
      'Escalate to a human team member when the caller asks for one, when you cannot answer, or when the situation is urgent (medical, legal, billing dispute). Sends an email alert.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Short reason for the transfer (e.g. "caller insists on speaking to a human", "medical emergency mentioned").',
        },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    webhook: { url: toolUrl('transfer_to_human'), method: 'POST', headers: defaultHeaders() },
  }),
};

/**
 * Builds the concrete tool array for a given template. The tools are
 * constructed lazily so that `env.NEXT_PUBLIC_APP_URL` is read at request
 * time — important for preview deployments where the base URL differs
 * per branch.
 */
export function getToolsForTemplate(template: TemplateKey): VoiceFlowTool[] {
  return TEMPLATE_TOOL_NAMES[template].map((name) => TOOL_DEFINITIONS[name]());
}

/** Build a single tool by name — used when assembling a `custom` set. */
export function getTool(name: VoiceFlowToolName): VoiceFlowTool {
  return TOOL_DEFINITIONS[name]();
}

/** Read-only catalog for UI (wizard) without instantiating webhook URLs. */
export const TOOL_CATALOG: Record<
  VoiceFlowToolName,
  { name: VoiceFlowToolName; description: string }
> = {
  check_availability: {
    name: 'check_availability',
    description: 'Check open dates/times.',
  },
  book_appointment: { name: 'book_appointment', description: 'Book a 1:1 appointment.' },
  book_reservation: { name: 'book_reservation', description: 'Book a restaurant reservation.' },
  log_lead: { name: 'log_lead', description: 'Capture a sales lead.' },
  transfer_to_human: {
    name: 'transfer_to_human',
    description: 'Escalate to a human via email.',
  },
};
