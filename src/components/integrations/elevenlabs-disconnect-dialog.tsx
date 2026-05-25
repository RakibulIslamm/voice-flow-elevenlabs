'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { disconnectElevenLabs } from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';

export function ElevenLabsDisconnectDialog({
  open,
  onOpenChange,
  agentCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentCount: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const result = await disconnectElevenLabs(undefined);
      if (result.ok) {
        toast.success(
          agentCount > 0
            ? `Disconnected. ${agentCount} agent${agentCount === 1 ? '' : 's'} paused.`
            : 'Disconnected.',
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `disconnectElevenLabs failed: ${result.error.code}`,
          name: 'DisconnectElevenLabsError',
          context: { scope: 'integrations-disconnect', code: result.error.code },
        });
      }
    } catch (e) {
      toast.error('Something went wrong. Please try again.');
      void reportClientError({
        message: `disconnectElevenLabs threw: ${e instanceof Error ? e.message : 'unknown'}`,
        name: 'DisconnectElevenLabsError',
        stack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const description =
    agentCount === 0
      ? 'This will remove your API key. You can reconnect anytime.'
      : `This will remove your API key and pause your ${agentCount} agent${
          agentCount === 1 ? '' : 's'
        }. You can reconnect anytime to restore them.`;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl tracking-tight">
            Disconnect ElevenLabs?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
