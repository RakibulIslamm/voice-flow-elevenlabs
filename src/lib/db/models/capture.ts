import { Schema, model, models, type Model, type Types } from 'mongoose';

export type CaptureType = 'appointment' | 'reservation' | 'lead' | 'callback-request';
export type CaptureStatus = 'confirmed' | 'cancelled' | 'rescheduled';

export type CaptureDoc = {
  _id: Types.ObjectId;
  callId: Types.ObjectId;
  agentId: Types.ObjectId;
  userId: Types.ObjectId;
  type: CaptureType;
  status: CaptureStatus;
  /**
   * Short caller-facing identifier (e.g. `R4K9-2X`). The agent reads it
   * back to the caller and accepts it as input to lookup/cancel/reschedule
   * tools. Unique per user so two operators can't clash on the same code.
   */
  code: string;
  data: unknown;
  cancelledAt?: Date;
  rescheduledAt?: Date;
  /** Original date/time before the last reschedule — for audit. */
  rescheduledFrom?: { date?: string; time?: string };
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
    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'rescheduled'] as const,
      default: 'confirmed',
      required: true,
    },
    code: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    cancelledAt: { type: Date },
    rescheduledAt: { type: Date },
    rescheduledFrom: {
      type: new Schema(
        { date: { type: String }, time: { type: String } },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

captureSchema.index({ userId: 1, createdAt: -1 });
// Per-user uniqueness on the short code — the lookup tool depends on
// this to disambiguate when a caller reads back a confirmation number.
captureSchema.index({ userId: 1, code: 1 }, { unique: true });

export const Capture =
  (models.Capture as Model<CaptureDoc>) || model<CaptureDoc>('Capture', captureSchema);
