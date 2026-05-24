import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { isAppError, RateLimitError } from '@/lib/errors';
import { logError } from '@/lib/tracking/log-error';

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
          await logError(e, {
            source: 'safeRoute',
            code: e.code,
            path: req.nextUrl?.pathname,
            method: req.method,
          });
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

      await logError(e, {
        source: 'safeRoute',
        path: req.nextUrl?.pathname,
        method: req.method,
      });
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
