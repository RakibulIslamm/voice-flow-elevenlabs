import { Schema, model, models, type Model, type Types } from 'mongoose';

export type CaptureType = 'appointment' | 'reservation' | 'lead' | 'callback-request';

export type CaptureDoc = {
  _id: Types.ObjectId;
  callId: Types.ObjectId;
  agentId: Types.ObjectId;
  userId: Types.ObjectId;
  type: CaptureType;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const captureSchema = new Schema<CaptureDoc>(
  {
    callId: { type: Schema.Types.ObjectId, ref: 'Call', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['appointment', 'reservation', 'lead', 'callback-request'] as const,
      required: true,
    },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

captureSchema.index({ userId: 1, createdAt: -1 });

export const Capture =
  (models.Capture as Model<CaptureDoc>) || model<CaptureDoc>('Capture', captureSchema);
