import { connectDb } from '@/lib/db/connect';
import { User } from '@/lib/db/models/user';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/page-header';

export const metadata = { title: 'Users · Admin · VoiceFlow' };
export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  email: string;
  plan: string;
  isAdmin: boolean;
  createdAt: string;
};

async function loadUsers(): Promise<UserRow[]> {
  try {
    await connectDb();
    const docs = await User.find({})
      .select('email plan isAdmin createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return docs.map((d) => ({
      id: String(d._id),
      email: d.email,
      plan: d.plan,
      isAdmin: !!d.isAdmin,
      createdAt: d.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export default async function AdminUsersPage() {
  const rows = await loadUsers();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="All registered VoiceFlow accounts. Read-only — promote admins via the shell snippet in README.md."
      />
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Email</TableHead>
              <TableHead className="w-[110px]">Plan</TableHead>
              <TableHead className="w-[110px]">Role</TableHead>
              <TableHead className="w-[170px]">Joined</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  No users yet, or MongoDB is unreachable.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">{row.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.plan === 'free' ? 'secondary' : 'default'}
                      className="capitalize"
                    >
                      {row.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.isAdmin ? (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        Admin
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Member</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {row.id}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
