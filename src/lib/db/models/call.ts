import { Schema, model, models, type Model, type Types } from 'mongoose';

export type CallChannel = 'browser' | 'phone';
export type CallStatus = 'in-progress' | 'completed' | 'failed' | 'abandoned';
export type TranscriptRole = 'user' | 'assistant';

export type TranscriptTurn = {
  role: TranscriptRole;
  content: string;
  timestamp: Date;
};

export type ToolCallRecord = {
  name: string;
  input: unknown;
  output: unknown;
  timestamp: Date;
};

export type CallDoc = {
  _id: Types.ObjectId;
  agentId: Types.ObjectId;
  userId: Types.ObjectId;
  channel: CallChannel;
  externalCallId: string;
  callerInfo?: unknown;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  status: CallStatus;
  transcript: TranscriptTurn[];
  toolCalls: ToolCallRecord[];
  outcome?: string;
  summary?: string;
  costUsd?: number;
  createdAt: Date;
  updatedAt: Date;
};

const transcriptTurnSchema = new Schema<TranscriptTurn>(
  {
    role: { type: String, enum: ['user', 'assistant'] as const, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const toolCallSchema = new Schema<ToolCallRecord>(
  {
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const callSchema = new Schema<CallDoc>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: ['browser', 'phone'] as const, required: true },
    externalCallId: { type: String, required: true, unique: true },
    callerInfo: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number },
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'failed', 'abandoned'] as const,
      default: 'in-progress',
    },
    transcript: { type: [transcriptTurnSchema], default: [] },
    toolCalls: { type: [toolCallSchema], default: [] },
    outcome: { type: String },
    summary: { type: String },
    costUsd: { type: Number },
  },
  { timestamps: true },
);

// Compound index for common dashboard queries: "calls for this user, newest first".
callSchema.index({ userId: 1, createdAt: -1 });
callSchema.index({ agentId: 1, createdAt: -1 });

export const Call =
  (models.Call as Model<CallDoc>) || model<CallDoc>('Call', callSchema);
