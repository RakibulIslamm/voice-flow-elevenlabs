import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { isAppError, RateLimitError } from '@/lib/errors';

export type SafeRouteOptions<Input> = {
  schema?: ZodType<Input>;
  parse?: (req: NextRequest) => Promise<unknown> | unknown;
  handler: (ctx: {
    input: Input;
    req: NextRequest;
  }) => Promise<NextResponse | Response> | NextResponse | Response;
};

export function safeRoute<Input = unknown>(opts: SafeRouteOptions<Input>) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      let input: Input;
      if (opts.schema) {
        const raw = opts.parse ? await opts.parse(req) : await readJson(req);
        input = opts.schema.parse(raw);
      } else {
        input = undefined as Input;
      }
      return await opts.handler({ input, req });
    } catch (e) {
      if (e instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of e.issues) {
          if (issue.path.length > 0) fields[issue.path.join('.')] = issue.message;
        }
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', fields } },
          { status: 400 },
        );
      }

      if (isAppError(e)) {
        if (e.statusCode >= 500) {
          // TODO(phase-3): persist to ErrorLog
          console.error('[safeRoute] AppError 5xx', { code: e.code, message: e.message });
        }
        const headers: Record<string, string> = {};
        if (e instanceof RateLimitError && typeof e.retryAfterSeconds === 'number') {
          headers['Retry-After'] = String(e.retryAfterSeconds);
        }
        return NextResponse.json(
          { ok: false, error: { code: e.code, message: e.publicMessage } },
          { status: e.statusCode, headers },
        );
      }

      // TODO(phase-3): persist to ErrorLog (unexpected)
      console.error('[safeRoute] unexpected', e);
      return NextResponse.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } },
        { status: 500 },
      );
    }
  };
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
