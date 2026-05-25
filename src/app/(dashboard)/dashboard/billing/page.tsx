import { CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const metadata = { title: 'Billing · VoiceFlow' };

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Plan selection, usage and invoices."
      />
      <EmptyState
        icon={CreditCard}
        title="Billing coming in Phase 13"
        description="Plan picker, metered usage display, payment method and invoice history land here."
      />
    </div>
  );
}
