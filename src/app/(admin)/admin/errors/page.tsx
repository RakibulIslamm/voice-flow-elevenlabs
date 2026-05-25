import { connectDb } from '@/lib/db/connect';
import { ErrorLog, type ErrorSeverity } from '@/lib/db/models/error-log';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorLogTable, type ErrorLogRow } from '@/components/admin/error-log-table';

export const metadata = { title: 'Errors · Admin · VoiceFlow' };
export const dynamic = 'force-dynamic';

const ALLOWED_SEVERITIES: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

async function loadErrors(severity: ErrorSeverity | null): Promise<ErrorLogRow[]> {
  try {
    await connectDb();
    const query = severity ? { severity } : {};
    const docs = await ErrorLog.find(query).sort({ occurredAt: -1 }).limit(200).lean();
    return docs.map((d) => ({
      id: String(d._id),
      message: d.message,
      stack: d.stack,
      name: d.name,
      code: d.code,
      severity: d.severity,
      context: d.context,
      occurredAt: d.occurredAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const { severity: severityParam } = await searchParams;
  const severity = (ALLOWED_SEVERITIES as string[]).includes(severityParam ?? '')
    ? (severityParam as ErrorSeverity)
    : null;

  const rows = await loadErrors(severity);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Errors"
        description="Errors persisted via logError() with a 30-day TTL. Click a row for the full stack and context."
      />
      <ErrorLogTable rows={rows} severity={severity ?? 'all'} />
    </div>
  );
}
