import {
  LayoutDashboard,
  Bot,
  PhoneCall,
  Inbox,
  Plug,
  CreditCard,
  Settings,
  ShieldCheck,
  CircleAlert,
  Activity,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When true, only matches the exact path (no descendant highlighting). */
  exact?: boolean;
};

export const DASHBOARD_MAIN_NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Agents', href: '/dashboard/agents', icon: Bot },
  { label: 'Calls', href: '/dashboard/calls', icon: PhoneCall },
  { label: 'Captures', href: '/dashboard/captures', icon: Inbox },
  { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
];

export const DASHBOARD_FOOTER_NAV: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const ADMIN_NAV: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: ShieldCheck, exact: true },
  { label: 'Errors', href: '/admin/errors', icon: CircleAlert },
  { label: 'Events', href: '/admin/events', icon: Activity },
  { label: 'Users', href: '/admin/users', icon: Users },
];

export function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
