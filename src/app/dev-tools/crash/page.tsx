import { notFound } from 'next/navigation';

/**
 * Dev-only route used to verify that error.tsx + global-error.tsx + the
 * onRequestError instrumentation hook all fire correctly. In production
 * this 404s instead of crashing — visit /_dev/crash in `pnpm dev` or
 * `pnpm verify:prod-with-crash` to exercise the error path.
 */
export default function CrashPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  throw new Error('Intentional crash for testing error.tsx — only available in development');
}
