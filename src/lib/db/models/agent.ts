import { Schema, model, models, type Model, type Types } from 'mongoose';

export type AgentTemplate = 'dental' | 'restaurant' | 'lead-qualifier' | 'custom';
export type AgentStatus = 'active' | 'paused';
export type AgentTonePreset = 'professional' | 'friendly' | 'casual';

export type AgentFaqEntry = {
  question: string;
  answer: string;
};

export type AgentBrowserChannel = {
  enabled: boolean;
  publicSlug: string;
  allowedDomains: string[];
};

export type AgentPhoneChannel = {
  enabled: boolean;
  twilioPhoneNumberSid?: string;
  twilioPhoneNumber?: string;
};

export type AgentDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  template: AgentTemplate;
  businessName?: string;
  businessHours?: unknown;
  faq: AgentFaqEntry[];
  elevenLabsAgentId: string;
  elevenLabsPhoneAgentId?: string;
  voiceId: string;
  greeting?: string;
  systemPrompt?: string;
  tonePreset: AgentTonePreset;
  status: AgentStatus;
  channels: {
    browser: AgentBrowserChannel;
    phone: AgentPhoneChannel;
  };
  createdAt: Date;
  updatedAt: Date;
};

const faqEntrySchema = new Schema<AgentFaqEntry>(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const browserChannelSchema = new Schema<AgentBrowserChannel>(
  {
    enabled: { type: Boolean, default: true },
    publicSlug: { type: String, required: true, unique: true, index: true },
    allowedDomains: { type: [String], default: [] },
  },
  { _id: false },
);

const phoneChannelSchema = new Schema<AgentPhoneChannel>(
  {
    enabled: { type: Boolean, default: false },
    twilioPhoneNumberSid: { type: String },
    twilioPhoneNumber: { type: String },
  },
  { _id: false },
);

const agentSchema = new Schema<AgentDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    template: {
      type: String,
      enum: ['dental', 'restaurant', 'lead-qualifier', 'custom'] as const,
      required: true,
    },
    businessName: { type: String },
    businessHours: { type: Schema.Types.Mixed },
    faq: { type: [faqEntrySchema], default: [] },
    elevenLabsAgentId: { type: String, required: true, unique: true },
    elevenLabsPhoneAgentId: { type: String, sparse: true, unique: true },
    voiceId: { type: String, required: true },
    greeting: { type: String },
    systemPrompt: { type: String },
    tonePreset: {
      type: String,
      enum: ['professional', 'friendly', 'casual'] as const,
      default: 'professional',
    },
    status: {
      type: String,
      enum: ['active', 'paused'] as const,
      default: 'active',
    },
    channels: {
      browser: { type: browserChannelSchema, required: true },
      phone: { type: phoneChannelSchema, default: () => ({ enabled: false }) },
    },
  },
  { timestamps: true },
);

export const Agent =
  (models.Agent as Model<AgentDoc>) || model<AgentDoc>('Agent', agentSchema);
