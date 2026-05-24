import { Schema, model, models, type Model, type Types } from 'mongoose';

export type EventLogDoc = {
  _id: Types.ObjectId;
  name: string;
  userId?: Types.ObjectId;
  agentId?: Types.ObjectId;
  callId?: Types.ObjectId;
  properties?: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const eventLogSchema = new Schema<EventLogDoc>(
  {
    name: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', sparse: true, index: true },
    callId: { type: Schema.Types.ObjectId, ref: 'Call', sparse: true, index: true },
    properties: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: true },
);

// TTL: auto-delete after 30 days.
eventLogSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
// Newest-first listings.
eventLogSchema.index({ occurredAt: -1 });

export const EventLog =
  (models.EventLog as Model<EventLogDoc>) ||
  model<EventLogDoc>('EventLog', eventLogSchema);
