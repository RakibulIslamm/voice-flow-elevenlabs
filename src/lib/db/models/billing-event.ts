import { Schema, model, models, type Model, type Types } from 'mongoose';

export type BillingEventDoc = {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  type: string;
  stripeEventId?: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const billingEventSchema = new Schema<BillingEventDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, required: true },
    // Sparse unique: enforces uniqueness only when present. Used to dedupe
    // Stripe webhook deliveries (Stripe retries can fire the same event id).
    stripeEventId: { type: String, sparse: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

billingEventSchema.index({ userId: 1, createdAt: -1 });

export const BillingEvent =
  (models.BillingEvent as Model<BillingEventDoc>) ||
  model<BillingEventDoc>('BillingEvent', billingEventSchema);
