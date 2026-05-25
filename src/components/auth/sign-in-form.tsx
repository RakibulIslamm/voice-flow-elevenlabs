'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Loader2, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfigurationRequired } from '@/components/states/configuration-required';
import { getAuthUserMessage } from '@/lib/auth/error-messages';
import { reportClientError } from '@/lib/tracking/client-report';

const schema = z.object({
  email: z.email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

type Variant = 'sign-in' | 'sign-up';

export type SignInFormProviders = {
  google: boolean;
  resend: boolean;
  anyEnabled: boolean;
};

export function SignInForm({
  variant = 'sign-in',
  providers,
}: {
  variant?: Variant;
  providers: SignInFormProviders;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sentTo, setSentTo] = useState<string>('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { email: '' },
  });

  // Surface server-redirect-flow errors. When OAuth fails *after* a
  // browser-level redirect (e.g. Google → /api/auth/callback/google →
  // /sign-in?error=OAuthAccountNotLinked), Auth.js can't return a result
  // object to the client — it only appends `?error=<code>` to the URL.
  // The `signIn()` client path is already handled in handleEmailSubmit /
  // handleGoogle, so this effect covers the redirect leg only.
  const shownErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const code = searchParams.get('error');
    if (!code || shownErrorRef.current === code) return;
    shownErrorRef.current = code;
    toast.error(getAuthUserMessage(code));
    void reportClientError({
      message: `Auth redirect error: ${code}`,
      name: 'AuthRedirectError',
      context: {
        scope: 'auth-signin',
        source: 'redirect-query',
        code,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    });
    // Strip the param so a refresh doesn't re-toast and so the URL stays clean.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState(null, '', url.toString());
    }
  }, [searchParams]);

  // No providers configured — render the generic configuration panel.
  // (Below the early return so hook count stays stable across renders.)
  if (!providers.anyEnabled) {
    return (
      <ConfigurationRequired
        title="Sign-in isn’t available right now"
        description="We couldn’t set up sign-in. Please try again later or contact support."
        groups={[
          {
            label: 'Google OAuth',
            vars: ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'],
            hint: 'Get credentials from console.cloud.google.com/apis/credentials',
          },
          {
            label: 'Magic link (Resend)',
            vars: ['AUTH_RESEND_KEY', 'RESEND_FROM_EMAIL'],
            hint: 'Get an API key from resend.com and a verified sender domain.',
          },
        ]}
        note="Also recommended: AUTH_SECRET — generate with `openssl rand -base64 32`."
      />
    );
  }

  async function handleEmailSubmit(values: FormValues) {
    setState('sending');
    try {
      const result = await signIn('resend', {
        email: values.email,
        callbackUrl,
        redirect: false,
      });

      // Auth.js v5: `signIn` returns `{ ok, error, status, url }` or undefined.
      // We treat anything that isn't an explicit success as a failure and
      // surface a user-friendly message while logging the raw code.
      if (!result || result.error || result.ok === false) {
        setState('error');
        const code = result?.error ?? null;
        toast.error(getAuthUserMessage(code));
        void reportClientError({
          message: `Auth signIn failed (resend): ${code ?? 'unknown'}`,
          name: 'AuthSignInError',
          context: {
            scope: 'auth-signin',
            method: 'resend',
            code,
            status: result?.status,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
          },
        });
        return;
      }

      setSentTo(values.email);
      setState('sent');
    } catch (e) {
      setState('error');
      const message = e instanceof Error ? e.message : String(e);
      toast.error(getAuthUserMessage(null)); // generic — don't leak thrown messages
      void reportClientError({
        message: `Auth signIn threw (resend): ${message}`,
        name: 'AuthSignInError',
        stack: e instanceof Error ? e.stack : undefined,
        context: {
          scope: 'auth-signin',
          method: 'resend',
          thrown: true,
          rawMessage: message,
        },
      });
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const result = await signIn('google', { callbackUrl, redirect: false });

      if (result?.error) {
        toast.error(getAuthUserMessage(result.error));
        void reportClientError({
          message: `Auth signIn failed (google): ${result.error}`,
          name: 'AuthSignInError',
          context: {
            scope: 'auth-signin',
            method: 'google',
            code: result.error,
            status: result.status,
          },
        });
        setGoogleLoading(false);
        return;
      }

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      // No URL and no error — Auth.js misbehaviour; treat as failure.
      toast.error(getAuthUserMessage(null));
      void reportClientError({
        message: 'Auth signIn (google) returned no URL and no error',
        name: 'AuthSignInError',
        context: { scope: 'auth-signin', method: 'google', result },
      });
      setGoogleLoading(false);
    } catch (e) {
      setGoogleLoading(false);
      const message = e instanceof Error ? e.message : String(e);
      toast.error(getAuthUserMessage(null));
      void reportClientError({
        message: `Auth signIn threw (google): ${message}`,
        name: 'AuthSignInError',
        stack: e instanceof Error ? e.stack : undefined,
        context: {
          scope: 'auth-signin',
          method: 'google',
          thrown: true,
          rawMessage: message,
        },
      });
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-4 font-serif text-2xl text-foreground">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a magic link to
          <br />
          <span className="font-medium text-foreground">{sentTo}</span>
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          It can take a minute to arrive. Don’t forget to check spam.
        </p>
        <button
          type="button"
          onClick={() => {
            form.reset();
            setSentTo('');
            setState('idle');
          }}
          className="mt-6 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  const headingCopy =
    variant === 'sign-up'
      ? {
          h1: 'Create your VoiceFlow account',
          sub: 'Set up your first AI receptionist in 60 seconds.',
        }
      : { h1: 'Welcome back', sub: 'Sign in to manage your AI voice agents.' };

  const footerCopy =
    variant === 'sign-up'
      ? { prompt: 'Already have an account?', href: '/sign-in', cta: 'Sign in' }
      : { prompt: 'New here?', href: '/sign-up', cta: 'Create account' };

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
          {headingCopy.h1}
        </h1>
        <p className="text-sm text-muted-foreground">{headingCopy.sub}</p>
      </header>

      {providers.google ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full text-sm font-medium"
          onClick={handleGoogle}
          disabled={googleLoading || state === 'sending'}
        >
          {googleLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <GoogleIcon className="size-4" />
          )}
          Continue with Google
        </Button>
      ) : null}

      {providers.google && providers.resend ? (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-background px-3 text-muted-foreground">Or with email</span>
          </div>
        </div>
      ) : null}

      {providers.resend ? (
        <form onSubmit={form.handleSubmit(handleEmailSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              disabled={state === 'sending'}
              aria-invalid={!!form.formState.errors.email}
              {...form.register('email')}
              className="h-11"
            />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full text-sm font-medium"
            disabled={state === 'sending' || googleLoading}
          >
            {state === 'sending' ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending magic link…
              </>
            ) : (
              <>
                <Mail className="size-4" />
                Send magic link
              </>
            )}
          </Button>
        </form>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {footerCopy.prompt}{' '}
        <Link
          href={footerCopy.href}
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {footerCopy.cta}
          <ArrowRight className="size-3.5" />
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By {variant === 'sign-up' ? 'creating an account' : 'signing in'}, you agree to our{' '}
        <Link href="/legal/terms" className="underline-offset-4 hover:underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.11A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.35-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.42c1.62 0 3.06.55 4.21 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.67 2.84C6.71 7.36 9.14 5.42 12 5.42Z"
      />
    </svg>
  );
}
