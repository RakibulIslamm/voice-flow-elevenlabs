import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { SignInForm } from '@/components/auth/sign-in-form';
import { AuthHero } from '@/components/auth/auth-hero';
import { getEnabledProviders } from '@/lib/auth/enabled-providers';

export const metadata: Metadata = {
  title: 'Sign in — VoiceFlow',
  description: 'Sign in to manage your AI voice agents.',
};

export default function SignInPage() {
  const providers = getEnabledProviders();

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
        <Link
          href="/"
          className="inline-flex items-center font-serif text-2xl tracking-tight text-foreground"
          aria-label="VoiceFlow home"
        >
          VoiceFlow
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">
            <Suspense fallback={<div className="h-[420px]" aria-hidden />}>
              <SignInForm variant="sign-in" providers={providers} />
            </Suspense>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getUTCFullYear()} VoiceFlow
        </p>
      </div>

      <AuthHero />
    </div>
  );
}
