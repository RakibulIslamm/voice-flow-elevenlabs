import { Schema, model, models, type Model, type Types } from 'mongoose';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ErrorLogDoc = {
  _id: Types.ObjectId;
  message: string;
  stack?: string;
  name?: string;
  code?: string;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const errorLogSchema = new Schema<ErrorLogDoc>(
  {
    message: { type: String, required: true },
    stack: { type: String },
    name: { type: String },
    code: { type: String },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'] as const,
      default: 'medium',
    },
    context: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: true },
);

// Query indexes for the admin error dashboard.
errorLogSchema.index({ severity: 1 });
// TTL: auto-delete after 30 days. MongoDB scans every ~60s; expect up to
// a minute of drift on actual deletion.
errorLogSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
// Newest-first listing (combined with the TTL field).
errorLogSchema.index({ occurredAt: -1 });

export const ErrorLog =
  (models.ErrorLog as Model<ErrorLogDoc>) ||
  model<ErrorLogDoc>('ErrorLog', errorLogSchema);
