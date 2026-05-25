import { Schema, model, models, type Model, type Types } from 'mongoose';

export type UserPlan = 'free' | 'starter' | 'pro' | 'business';

export type UserUsage = {
  minutesUsedThisPeriod: number;
  periodStart?: Date;
  periodEnd?: Date;
};

export type TwilioIntegration = {
  enabled: boolean;
  encryptedCreds?: string;
  accountSidPreview?: string;
  connectedAt?: Date;
  verifiedAt?: Date;
};

/**
 * BYOK ElevenLabs integration. The user supplies their own API key via
 * the Integrations dashboard. We store it AES-256-GCM-encrypted and only
 * decrypt at the call site (see `src/lib/elevenlabs/client.ts`).
 *
 * `apiKeyPreview` (e.g. "sk_…abcd") is shown in the UI so users can tell
 * keys apart without us ever rendering the secret itself.
 *
 * Tier/usage fields are an opportunistic cache refreshed when the user
 * clicks "Refresh status" in the Integrations card — they're never the
 * source of truth for billing logic.
 */
export type ElevenLabsAccountInfo = {
  tier: string;
  characterLimit: number;
  charactersUsed: number;
};

export type ElevenLabsIntegration = {
  enabled: boolean;
  encryptedApiKey?: string;
  apiKeyPreview?: string;
  connectedAt?: Date;
  verifiedAt?: Date;
  /** Snapshot of the ElevenLabs subscription, refreshed on connect / verify. */
  accountInfo?: ElevenLabsAccountInfo;

  /**
   * Per-user post-call webhook secret. ElevenLabs generates this when the
   * user creates the webhook in their dashboard — we never choose it.
   * Encrypted at rest, decrypted only inside the webhook handler at
   * request time to verify the HMAC signature. Optional: an account can
   * be "connected" (API key set) before the webhook is configured.
   */
  encryptedWebhookSecret?: string;
  webhookSecretPreview?: string;
  webhookConfiguredAt?: Date;
};

export type UserDoc = {
  _id: Types.ObjectId;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: Date;
  isAdmin: boolean;
  plan: UserPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  usage: UserUsage;
  integrations: {
    elevenlabs: ElevenLabsIntegration;
    twilio: TwilioIntegration;
  };
  createdAt: Date;
  updatedAt: Date;
};

const usageSchema = new Schema<UserUsage>(
  {
    minutesUsedThisPeriod: { type: Number, default: 0 },
    periodStart: { type: Date },
    periodEnd: { type: Date },
  },
  { _id: false },
);

const twilioIntegrationSchema = new Schema<TwilioIntegration>(
  {
    enabled: { type: Boolean, default: false },
    encryptedCreds: { type: String },
    accountSidPreview: { type: String },
    connectedAt: { type: Date },
    verifiedAt: { type: Date },
  },
  { _id: false },
);

const elevenLabsAccountInfoSchema = new Schema<ElevenLabsAccountInfo>(
  {
    tier: { type: String, required: true },
    characterLimit: { type: Number, required: true },
    charactersUsed: { type: Number, required: true },
  },
  { _id: false },
);

const elevenLabsIntegrationSchema = new Schema<ElevenLabsIntegration>(
  {
    enabled: { type: Boolean, default: false },
    encryptedApiKey: { type: String },
    apiKeyPreview: { type: String },
    connectedAt: { type: Date },
    verifiedAt: { type: Date },
    accountInfo: { type: elevenLabsAccountInfoSchema },
    encryptedWebhookSecret: { type: String },
    webhookSecretPreview: { type: String },
    webhookConfiguredAt: { type: Date },
  },
  { _id: false },
);

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String },
    image: { type: String },
    emailVerified: { type: Date },
    isAdmin: { type: Boolean, default: false },
    plan: {
      type: String,
      enum: ['free', 'starter', 'pro', 'business'] as const,
      default: 'free',
    },
    stripeCustomerId: { type: String, sparse: true, unique: true },
    stripeSubscriptionId: { type: String },
    usage: { type: usageSchema, default: () => ({ minutesUsedThisPeriod: 0 }) },
    integrations: {
      elevenlabs: {
        type: elevenLabsIntegrationSchema,
        default: () => ({ enabled: false }),
      },
      twilio: { type: twilioIntegrationSchema, default: () => ({ enabled: false }) },
    },
  },
  { timestamps: true },
);

export const User =
  (models.User as Model<UserDoc>) || model<UserDoc>('User', userSchema);
