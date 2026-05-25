import 'next-auth';
import 'next-auth/jwt';
import type { UserPlan } from '@/lib/db/models/user';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      plan: UserPlan;
      isAdmin: boolean;
    };
  }

  interface User {
    plan?: UserPlan;
    isAdmin?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    plan?: UserPlan;
    isAdmin?: boolean;
  }
}
