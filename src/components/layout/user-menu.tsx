'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, Settings, CreditCard } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type UserMenuUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function UserMenu({ user }: { user: UserMenuUser }) {
  const initials = getInitials(user.name ?? user.email ?? 'U');
  const displayName = user.name ?? user.email ?? 'Account';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 rounded-full pr-2 transition hover:bg-foreground/5"
          aria-label="Open account menu"
        >
          <Avatar className="size-7 ring-1 ring-border/40">
            {user.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
            <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
          </Avatar>
          <ChevronDown
            className="size-3 text-muted-foreground transition group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 pb-2">
          <span className="truncate text-sm font-medium text-foreground">
            {user.name ?? 'Account'}
          </span>
          {user.email ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="cursor-pointer">
            <Settings className="size-3.5" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/billing" className="cursor-pointer">
            <CreditCard className="size-3.5" />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => signOut({ callbackUrl: '/' })}
          className="cursor-pointer"
        >
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
