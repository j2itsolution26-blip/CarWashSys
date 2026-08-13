import type { DefaultSession } from "next-auth";

/**
 * Session shape augmentation.
 *
 * `permissions` is carried on the token so a guard can answer "may this user
 * void a payment?" without a database round trip on every request. It is
 * re-read from the database periodically (see `PERMISSION_TTL_MS` in
 * `src/lib/auth/index.ts`) so a revoked role takes effect quickly rather than
 * at next login.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    roles?: string[];
    permissions?: string[];
  }
}

/**
 * Augmented on `@auth/core/jwt`, not `next-auth/jwt`: the latter is only a
 * re-export, so augmenting it would not reach the interface Auth.js actually
 * uses to type the `jwt` callback.
 */
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    permissions: string[];
    /** Epoch ms after which roles/permissions are re-read from the database. */
    permissionsRefreshAt: number;
  }
}

export {};
