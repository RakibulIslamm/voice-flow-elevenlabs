export type AppErrorOpts = {
  code: string;
  statusCode: number;
  publicMessage: string;
  message?: string;
  meta?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly publicMessage: string;
  readonly meta?: Record<string, unknown>;

  constructor(opts: AppErrorOpts) {
    super(opts.message ?? opts.publicMessage);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.publicMessage = opts.publicMessage;
    this.meta = opts.meta;
  }
}

export class ValidationError extends AppError {
  readonly fields: Record<string, string>;
  constructor(message = 'Invalid input.', fields: Record<string, string> = {}) {
    super({ code: 'VALIDATION_ERROR', statusCode: 400, publicMessage: message });
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You must sign in to continue.') {
    super({ code: 'UNAUTHORIZED', statusCode: 401, publicMessage: message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super({ code: 'FORBIDDEN', statusCode: 403, publicMessage: message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super({ code: 'NOT_FOUND', statusCode: 404, publicMessage: message });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds?: number;
  constructor(message = 'Too many requests. Please try again shortly.', retryAfterSeconds?: number) {
    super({
      code: 'RATE_LIMITED',
      statusCode: 429,
      publicMessage: message,
      meta: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * `reason` is the technical detail (always logged, never shown to users in
 * production). `publicMessage` is an optional user-facing override; without
 * it we fall back to the generic "temporarily unavailable" copy. In dev we
 * append the reason to the toast so engineers see the actual cause without
 * digging through the server log.
 */
export class ExternalServiceError extends AppError {
  readonly service: string;
  constructor(service: string, reason?: string, publicMessage?: string) {
    const safePublic =
      publicMessage ?? `${service} is temporarily unavailable. Please try again.`;
    const userFacing =
      process.env.NODE_ENV === 'development' && reason
        ? `${safePublic} [dev: ${reason}]`
        : safePublic;
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      statusCode: 502,
      publicMessage: userFacing,
      message: reason ?? `${service} request failed`,
      meta: { service, reason },
    });
    this.service = service;
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'You have reached your plan quota. Upgrade to continue.') {
    super({ code: 'QUOTA_EXCEEDED', statusCode: 402, publicMessage: message });
  }
}

export class InvalidCredentialError extends AppError {
  readonly service: string;
  constructor(service: string, message?: string) {
    super({
      code: 'INVALID_CREDENTIAL',
      statusCode: 400,
      publicMessage: message ?? `Your ${service} credentials are invalid.`,
      meta: { service },
    });
    this.service = service;
  }
}

export class WidgetUnauthorizedError extends AppError {
  constructor(message = 'Widget origin not authorised for this agent.') {
    super({ code: 'WIDGET_UNAUTHORIZED', statusCode: 401, publicMessage: message });
  }
}

export class IntegrationDisconnectedError extends AppError {
  readonly integration: string;
  constructor(integration: string, message?: string) {
    super({
      code: 'INTEGRATION_DISCONNECTED',
      statusCode: 400,
      publicMessage: message ?? `Connect your ${integration} account first.`,
      meta: { integration },
    });
    this.integration = integration;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
