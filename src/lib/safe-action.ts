import 'server-only';
import { ZodError, type ZodType } from 'zod';
import { isAppError } from '@/lib/errors';

export type ActionError = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function safeAction<Input, Output>(
  schema: ZodType<Input>,
  handler: (input: Input) => Promise<Output>,
) {
  return async (raw: unknown): Promise<ActionResult<Output>> => {
    let input: Input;
    try {
      input = schema.parse(raw);
    } catch (e) {
      if (e instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of e.issues) {
          if (issue.path.length > 0) {
            fields[issue.path.join('.')] = issue.message;
          }
        }
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', fields },
        };
      }
      // TODO(phase-3): persist to ErrorLog (parse failure)
      console.error('[safeAction] parse failure', e);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
    }

    try {
      const data = await handler(input);
      return { ok: true, data };
    } catch (e) {
      if (isAppError(e)) {
        if (e.statusCode >= 500) {
          // TODO(phase-3): persist to ErrorLog
          console.error('[safeAction] AppError 5xx', { code: e.code, message: e.message });
        }
        return { ok: false, error: { code: e.code, message: e.publicMessage } };
      }
      // TODO(phase-3): persist to ErrorLog (unexpected)
      console.error('[safeAction] unexpected', e);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
    }
  };
}
