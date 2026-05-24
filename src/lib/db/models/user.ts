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
      twilio: { type: twilioIntegrationSchema, default: () => ({ enabled: false }) },
    },
  },
  { timestamps: true },
);

export const User =
  (models.User as Model<UserDoc>) || model<UserDoc>('User', userSchema);
