'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { toast } from 'sonner';
import { Lock, Loader2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { connectTwilio } from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';

const formSchema = z.object({
  accountSid: z
    .string()
    .regex(/^AC[a-f0-9]{32}$/i, 'Account SID must start with AC followed by 32 hex characters.'),
  authToken: z
    .string()
    .min(20, 'Auth Token looks too short. Copy it from Twilio Console → API keys & tokens.'),
});

type FormValues = z.infer<typeof formSchema>;

export function TwilioConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: { accountSid: '', authToken: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await connectTwilio({
        accountSid: values.accountSid.trim(),
        authToken: values.authToken.trim(),
      });
      if (result.ok) {
        toast.success('Twilio connected', {
          description: `Account ${result.data.accountSidPreview}`,
        });
        onOpenChange(false);
        form.reset();
        router.refresh();
      } else {
        setServerError(result.error.message);
        void reportClientError({
          message: `connectTwilio failed: ${result.error.code}`,
          name: 'ConnectTwilioError',
          context: { scope: 'integrations-connect', code: result.error.code },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setServerError('Something went wrong. Please try again.');
      void reportClientError({
        message: `connectTwilio threw: ${message}`,
        name: 'ConnectTwilioError',
        stack: e instanceof Error ? e.stack : undefined,
        context: { scope: 'integrations-connect', thrown: true },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) {
          setServerError(null);
          form.reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl tracking-tight">Connect Twilio</DialogTitle>
          <DialogDescription>
            Paste your Twilio Account SID and Auth Token. We verify them against Twilio before
            saving, and encrypt them with AES-256-GCM at rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="accountSid" className="text-sm">
              Account SID
            </Label>
            <Input
              id="accountSid"
              type="text"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={!!form.formState.errors.accountSid}
              {...form.register('accountSid')}
              className="h-10 font-mono text-xs"
            />
            {form.formState.errors.accountSid ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.accountSid.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="authToken" className="text-sm">
              Auth Token
            </Label>
            <Input
              id="authToken"
              type="password"
              placeholder="••••••••••••••••••••••••••••••••"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={!!form.formState.errors.authToken}
              {...form.register('authToken')}
              className="h-10 font-mono text-xs"
            />
            {form.formState.errors.authToken ? (
              <p className="text-xs text-destructive">{form.formState.errors.authToken.message}</p>
            ) : null}
            <a
              href="https://console.twilio.com/us1/account/keys-credentials/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              How do I find these?
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 p-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your credentials are encrypted with AES-256-GCM before storage. They never leave our
              servers in plaintext. Decryption only happens server-side, in memory, at the moment
              of a Twilio API call or inbound webhook signature check.
            </p>
          </div>

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
