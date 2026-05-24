import 'server-only';
import { ZodError, type ZodType } from 'zod';
import { isAppError } from '@/lib/errors';
import { logError } from '@/lib/tracking/log-error';

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
      await logError(e, { source: 'safeAction', stage: 'parse' }, { severity: 'medium' });
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
    }

    try {
      const data = await handler(input);
      return { ok: true, data };
    } catch (e) {
      if (isAppError(e)) {
        if (e.statusCode >= 500) {
          await logError(e, { source: 'safeAction', code: e.code });
        }
        return { ok: false, error: { code: e.code, message: e.publicMessage } };
      }
      await logError(e, { source: 'safeAction', stage: 'handler' });
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } };
    }
  };
}
