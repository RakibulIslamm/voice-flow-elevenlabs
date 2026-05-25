'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { toast } from 'sonner';
import { Lock, Loader2 } from 'lucide-react';
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
import { setElevenLabsWebhookSecret } from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';

const formSchema = z.object({
  webhookSecret: z
    .string()
    .min(16, 'Webhook secret looks too short. ElevenLabs secrets are 32+ characters.'),
});

type FormValues = z.infer<typeof formSchema>;

export function ElevenLabsWebhookDialog({
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
    defaultValues: { webhookSecret: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await setElevenLabsWebhookSecret({ webhookSecret: values.webhookSecret });
      if (result.ok) {
        toast.success('Webhook secret saved');
        onOpenChange(false);
        form.reset();
        router.refresh();
      } else {
        setServerError(result.error.message);
        void reportClientError({
          message: `setElevenLabsWebhookSecret failed: ${result.error.code}`,
          name: 'WebhookSecretError',
          context: { code: result.error.code },
        });
      }
    } catch (e) {
      setServerError('Something went wrong. Please try again.');
      void reportClientError({
        message: `setElevenLabsWebhookSecret threw: ${e instanceof Error ? e.message : 'unknown'}`,
        name: 'WebhookSecretError',
        stack: e instanceof Error ? e.stack : undefined,
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
          <DialogTitle className="font-serif text-2xl tracking-tight">
            Save webhook secret
          </DialogTitle>
          <DialogDescription>
            Paste the secret ElevenLabs showed you right after you created the webhook. We
            encrypt it with AES-256-GCM at rest and use it to verify the HMAC signature on
            every post-call webhook.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="webhookSecret">Webhook secret</Label>
            <Input
              id="webhookSecret"
              type="password"
              placeholder="wsec_…"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={!!form.formState.errors.webhookSecret}
              {...form.register('webhookSecret')}
              className="h-10 font-mono text-sm"
            />
            {form.formState.errors.webhookSecret ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.webhookSecret.message}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              ElevenLabs only shows this once. If you missed it, delete the webhook in
              ElevenLabs and create a new one.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 p-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Stored encrypted (AES-256-GCM). Used inside the webhook handler to confirm
              incoming requests are genuinely from your ElevenLabs workspace.
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
                  Saving…
                </>
              ) : (
                'Save secret'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
