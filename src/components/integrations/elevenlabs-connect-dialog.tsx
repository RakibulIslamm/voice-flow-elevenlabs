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
import { connectElevenLabs } from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';

const formSchema = z.object({
  apiKey: z.string().min(20, 'API key looks too short. Double-check and try again.'),
});

type FormValues = z.infer<typeof formSchema>;

export function ElevenLabsConnectDialog({
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
    defaultValues: { apiKey: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await connectElevenLabs({ apiKey: values.apiKey });
      if (result.ok) {
        toast.success('ElevenLabs connected', {
          description: `Tier: ${result.data.accountInfo.tier}`,
        });
        onOpenChange(false);
        form.reset();
        router.refresh();
      } else {
        setServerError(result.error.message);
        void reportClientError({
          message: `connectElevenLabs failed: ${result.error.code}`,
          name: 'ConnectElevenLabsError',
          context: { scope: 'integrations-connect', code: result.error.code },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setServerError('Something went wrong. Please try again.');
      void reportClientError({
        message: `connectElevenLabs threw: ${message}`,
        name: 'ConnectElevenLabsError',
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
        if (submitting) return; // can't close mid-submit
        onOpenChange(next);
        if (!next) {
          setServerError(null);
          form.reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl tracking-tight">
            Connect ElevenLabs
          </DialogTitle>
          <DialogDescription>
            Paste your ElevenLabs API key. We verify it against ElevenLabs before saving,
            and encrypt it with AES-256-GCM at rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="apiKey" className="text-sm">
              API Key
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk_..."
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={!!form.formState.errors.apiKey}
              {...form.register('apiKey')}
              className="h-10 font-mono text-sm"
            />
            {form.formState.errors.apiKey ? (
              <p className="text-xs text-destructive">{form.formState.errors.apiKey.message}</p>
            ) : null}
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              How do I get this?
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 p-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your API key is encrypted with AES-256-GCM before storage. We never log it or
              expose it in plaintext. Decryption only happens server-side, in memory, at the
              moment of an ElevenLabs API call.
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
