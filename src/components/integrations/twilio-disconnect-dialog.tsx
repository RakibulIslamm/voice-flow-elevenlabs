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
import { disconnectTwilio } from '@/server/actions/integrations';
import { reportClientError } from '@/lib/tracking/client-report';

export function TwilioDisconnectDialog({
  open,
  onOpenChange,
  phoneAgentCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneAgentCount: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const result = await disconnectTwilio(undefined);
      if (result.ok) {
        const affected = result.data.agentsDisabled;
        toast.success(
          affected > 0
            ? `Disconnected. Phone disabled on ${affected} agent${affected === 1 ? '' : 's'}.`
            : 'Disconnected.',
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
        void reportClientError({
          message: `disconnectTwilio failed: ${result.error.code}`,
          name: 'DisconnectTwilioError',
          context: { scope: 'integrations-disconnect', code: result.error.code },
        });
      }
    } catch (e) {
      toast.error('Something went wrong. Please try again.');
      void reportClientError({
        message: `disconnectTwilio threw: ${e instanceof Error ? e.message : 'unknown'}`,
        name: 'DisconnectTwilioError',
        stack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Phone-enabled agents lose their channel when Twilio disconnects —
  // we surface this upfront so the user knows what they're signing up
  // for. Re-enabling later requires re-assigning the number.
  const description =
    phoneAgentCount === 0
      ? 'This will remove your Twilio credentials. You can reconnect anytime — no agents are affected.'
      : `This will remove your Twilio credentials and disable the phone channel on ${phoneAgentCount} agent${
          phoneAgentCount === 1 ? '' : 's'
        }. Re-assigning a number after reconnecting will re-enable them.`;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl tracking-tight">
            Disconnect Twilio?
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
