import 'server-only';
import { connectDb } from '@/lib/db/connect';
import { ErrorLog, type ErrorSeverity } from '@/lib/db/models/error-log';
import { isAppError } from '@/lib/errors';

type LogErrorContext = Record<string, unknown>;

type LogErrorOptions = {
  severity?: ErrorSeverity;
  /** Optional explicit override for the persisted message. */
  message?: string;
};

/**
 * Persist an error to the ErrorLog collection. NEVER throws — telemetry must
 * not be able to break the request path. On Mongo failure we fall back to
 * console.error.
 */
export async function logError(
  error: unknown,
  context: LogErrorContext = {},
  options: LogErrorOptions = {},
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = options.message ?? err.message ?? 'Unknown error';
  const severity: ErrorSeverity = options.severity ?? pickSeverity(error);
  const code = isAppError(error) ? error.code : undefined;

  try {
    await connectDb();
    await ErrorLog.create({
      message,
      stack: err.stack,
      name: err.name,
      code,
      severity,
      context,
      occurredAt: new Date(),
    });
  } catch (writeErr) {
    // Last-resort fallback. We still want SOME signal even if Mongo is down.
    console.error('[logError] failed to persist; original error follows', {
      writeErr: writeErr instanceof Error ? writeErr.message : String(writeErr),
      originalMessage: message,
      originalStack: err.stack,
      context,
    });
  }
}

function pickSeverity(error: unknown): ErrorSeverity {
  if (isAppError(error)) {
    if (error.statusCode >= 500) return 'high';
    if (error.statusCode === 429) return 'medium';
    return 'low';
  }
  return 'high';
}
