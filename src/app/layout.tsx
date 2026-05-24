import type { Metadata } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import '@/lib/env';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/toaster';
import { ErrorBoundary } from '@/components/error-boundary';
import { ErrorTelemetry } from '@/components/error-telemetry';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VoiceFlow — AI Voice Agents for Your Website & Phone',
  description:
    'Configure a custom AI voice agent for your business. Visitors talk to it in their browser or call your number — answered instantly, with human-like quality.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn('h-full antialiased', sans.variable, serif.variable, mono.variable)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning className="min-h-full font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <ErrorBoundary>{children}</ErrorBoundary>
          <ErrorTelemetry />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
