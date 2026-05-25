import { connectDb } from '@/lib/db/connect';
import { EventLog } from '@/lib/db/models/event-log';
import { PageHeader } from '@/components/layout/page-header';
import { EventLogTable, type EventLogRow } from '@/components/admin/event-log-table';

export const metadata = { title: 'Events · Admin · VoiceFlow' };
export const dynamic = 'force-dynamic';

async function loadEvents(name: string | null): Promise<EventLogRow[]> {
  try {
    await connectDb();
    const query = name ? { name } : {};
    const docs = await EventLog.find(query).sort({ occurredAt: -1 }).limit(200).lean();
    return docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      userId: d.userId ? String(d.userId) : undefined,
      agentId: d.agentId ? String(d.agentId) : undefined,
      callId: d.callId ? String(d.callId) : undefined,
      properties: d.properties,
      occurredAt: d.occurredAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  const rows = await loadEvents(name ?? null);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Events"
        description="Product and pipeline events persisted via logEvent() with a 30-day TTL."
      />
      <EventLogTable rows={rows} name={name ?? ''} />
    </div>
  );
}
