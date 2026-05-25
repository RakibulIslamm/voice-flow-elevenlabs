import { auth } from '~/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';

export const metadata = { title: 'Settings · VoiceFlow' };

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null; // proxy + layout already gate access; defensive

  const initials = getInitials(user.name ?? user.email ?? 'U');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile and account information. Voice + agent settings live on each agent's page."
      />

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-serif text-xl tracking-tight">Profile</h2>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            {user.image ? <AvatarImage src={user.image} alt={user.name ?? 'Account'} /> : null}
            <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
          </Avatar>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Name" value={user.name ?? '—'} />
            <Field label="Email" value={user.email ?? '—'} />
            <Field
              label="Plan"
              value={
                <Badge variant={user.plan === 'free' ? 'secondary' : 'default'}>
                  {user.plan}
                </Badge>
              }
            />
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-serif text-xl tracking-tight">Identifiers</h2>
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="User ID" value={user.id} mono />
          <Field label="Role" value={user.isAdmin ? 'Admin' : 'Member'} />
        </dl>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-foreground ${mono ? 'truncate font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function getInitials(input: string): string {
  const parts = input.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const local = input.split('@')[0];
  return local.slice(0, 2).toUpperCase();
}
