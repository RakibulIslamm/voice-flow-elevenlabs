/**
 * Boot-time + per-request observability hook.
 *
 * `register()` runs ONCE per process on cold start.
 * `onRequestError()` fires for every uncaught Server Component / Route Handler /
 * Server Action error — the only hook that sees them before they reach error.tsx.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Force env validation to run once on boot (soft — logs warnings, never throws).
    await import('@/lib/env');

    // Log dangling promise rejections so they're visible in server logs.
    // These don't terminate the Node process by default in modern Node, so
    // observing them is a pure win.
    process.on('unhandledRejection', (reason) => {
      console.error('[process] unhandledRejection', reason);
    });

    // Intentionally NOT installing a `uncaughtException` handler:
    //   1. After an uncaught exception the process state is undefined
    //      (corrupted vars, leaked DB connections, half-written buffers).
    //      Swallowing it would let the next request execute against bad state.
    //   2. On Vercel, the platform's own error wrapper logs + restarts the
    //      worker cleanly. Our handler would just duplicate the log and
    //      possibly interfere.
    //   3. On self-hosted Node, the process manager (PM2 / Docker / systemd)
    //      should restart the process. Swallowing prevents that.
    // The conventional rule: let it crash, let the platform restart.
  }
}

type OnRequestErrorRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type OnRequestErrorContext = {
  routerKind: 'Pages Router' | 'App Router';
  routePath: string;
  routeType: 'render' | 'route' | 'action' | 'middleware';
  renderSource?: string;
  revalidateReason?: 'on-demand' | 'stale' | undefined;
  renderType?: 'dynamic' | 'dynamic-resume';
};

export async function onRequestError(
  error: unknown,
  request: OnRequestErrorRequest,
  context: OnRequestErrorContext,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error('[onRequestError]', {
    message,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });

  // TODO(phase-3): persist to ErrorLog model. We avoid an HTTP round-trip to
  // /api/internal/log-error here because this hook runs on the same server.
  void stack;
}
