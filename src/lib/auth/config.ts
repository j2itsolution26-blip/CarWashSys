import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth configuration.
 *
 * Middleware runs on the Edge runtime, where bcrypt and Prisma cannot load.
 * This file therefore contains NO providers and NO database access — only
 * cookie/session policy and the callbacks needed to read an existing token.
 * The Credentials provider lives in `./index.ts`, which only ever runs in the
 * Node.js runtime.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    // A counter terminal is a shared device; an 8-hour shift-length session
    // means an unattended POS does not stay authenticated overnight.
    maxAge: 8 * 60 * 60,
    updateAge: 30 * 60,
  },
  trustHost: true,
  callbacks: {
    /**
     * Route-level gate used by middleware. Fine-grained permission checks are
     * NOT done here — they are enforced server-side in the service layer, since
     * middleware can be bypassed by any direct server-action invocation.
     */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      /*
       * Owner self-registration is necessarily reachable while signed out — it
       * is how the very first account comes into existence. The pages guard
       * themselves server-side by refusing to render once an owner exists, so
       * being listed here grants no privilege.
       */
      const isPublic =
        pathname === "/login" ||
        pathname === "/register-owner" ||
        pathname === "/verify-owner" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";

      if (isPublic) return true;
      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
