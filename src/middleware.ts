import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Session gate for page navigation.
 *
 * This only answers "is there a valid session?" — it is a redirect convenience,
 * not the security boundary. Real authorisation happens in the service layer
 * (`src/lib/auth/guards.ts`), because a server action can be invoked directly
 * without ever passing through middleware.
 *
 * Uses the edge-safe config only: no Prisma, no bcrypt.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets. Auth API routes are
     * allowed through by the `authorized` callback rather than excluded here, so
     * that sign-out still works.
     *
     * `manifest.webmanifest` and `sw.js` MUST be excluded explicitly — neither
     * ends in an image extension, so without them the matcher intercepted both
     * and 307'd them to /login. The browser fetches the manifest anonymously,
     * so it would have received a redirect instead of JSON and quietly refused
     * to offer installation; the service worker would never have registered at
     * all. Both files are public, non-sensitive static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
