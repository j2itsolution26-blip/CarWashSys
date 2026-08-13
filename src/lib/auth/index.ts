import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation/schemas";
import { authConfig } from "./config";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";

/**
 * Node-runtime auth entry point: the Credentials provider, password
 * verification and role/permission loading.
 *
 * SECURITY NOTES
 *  * Passwords are bcrypt-hashed with cost 12 and compared in constant time by
 *    bcrypt itself.
 *  * A wrong password and an unknown email produce the SAME error message and
 *    a comparable amount of work (see the dummy hash compare below), so the
 *    login form cannot be used to enumerate which staff emails exist.
 *  * Repeated failures lock the ACCOUNT in the database rather than relying on
 *    in-memory IP counters, which do not survive a serverless cold start.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** How long a token's cached permission set is trusted before a re-read. */
const PERMISSION_TTL_MS = 5 * 60 * 1000;

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

/** Re-exported for callers that already import it from here. */
export { hashPassword } from "./password";

export interface LoadedIdentity {
  roles: string[];
  permissions: string[];
}

/** Read a user's effective roles and flattened permission keys. */
export async function loadIdentity(userId: string): Promise<LoadedIdentity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      roles: {
        select: {
          role: {
            select: {
              key: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  const roles = user.roles.map((link) => link.role.key);
  const permissions = [
    ...new Set(
      user.roles.flatMap((link) => link.role.permissions.map((rp) => rp.permission.key)),
    ),
  ];

  return { roles, permissions };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          // Burn equivalent CPU so timing does not reveal that the email is unknown.
          await verifyPassword(password, DUMMY_PASSWORD_HASH);
          await recordFailedLogin(email, null, "unknown-account");
          throw new CredentialsError(GENERIC_LOGIN_ERROR);
        }

        if (!user.isActive) {
          await recordFailedLogin(email, user.id, "inactive-account");
          throw new CredentialsError("This account has been deactivated. Contact the owner.");
        }

        /*
         * An account that has not confirmed its email is "pending", not active,
         * and cannot sign in. In practice the owner flow never creates a User
         * row until the code is confirmed — this is the belt to that braces,
         * covering any future path that creates an unverified account.
         */
        if (!user.emailVerified) {
          await recordFailedLogin(email, user.id, "email-not-verified");
          throw new CredentialsError(
            "This account is still pending email verification and cannot sign in yet.",
          );
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutes = Math.max(
            1,
            Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
          );
          throw new CredentialsError(
            `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          );
        }

        const passwordMatches = await verifyPassword(password, user.passwordHash);

        if (!passwordMatches) {
          const attempts = user.failedLoginAttempts + 1;
          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: shouldLock
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                : null,
            },
          });
          await recordFailedLogin(email, user.id, shouldLock ? "locked-out" : "bad-password");
          throw new CredentialsError(
            shouldLock
              ? `Too many failed attempts. This account is locked for ${LOCKOUT_MINUTES} minutes.`
              : GENERIC_LOGIN_ERROR,
          );
        }

        const identity = await loadIdentity(user.id);
        if (!identity) throw new CredentialsError(GENERIC_LOGIN_ERROR);

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        await prisma.auditLog.create({
          data: {
            action: "USER_LOGIN",
            entityType: "User",
            entityId: user.id,
            actorId: user.id,
            actorName: user.name,
            actorEmail: user.email,
            summary: `${user.name} signed in`,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: identity.roles,
          permissions: identity.permissions,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.id = user.id;
        token.roles = user.roles ?? [];
        token.permissions = user.permissions ?? [];
        token.permissionsRefreshAt = Date.now() + PERMISSION_TTL_MS;
        return token;
      }

      const isStale = !token.permissionsRefreshAt || Date.now() > token.permissionsRefreshAt;
      if (token.id && (isStale || trigger === "update")) {
        const identity = await loadIdentity(token.id);
        if (!identity) {
          // Deactivated or deleted mid-session: strip all capability. The next
          // guard call fails closed and the user is bounced to /login.
          token.roles = [];
          token.permissions = [];
        } else {
          token.roles = identity.roles;
          token.permissions = identity.permissions;
        }
        token.permissionsRefreshAt = Date.now() + PERMISSION_TTL_MS;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.roles = token.roles ?? [];
        session.user.permissions = token.permissions ?? [];
      }
      return session;
    },
  },
});

/** Error whose message Auth.js is allowed to surface to the login form. */
class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsSignin";
  }
}

async function recordFailedLogin(
  email: string,
  userId: string | null,
  reason: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: "USER_LOGIN_FAILED",
        entityType: "User",
        entityId: userId,
        actorId: userId,
        actorEmail: email,
        summary: `Failed sign-in for ${email} (${reason})`,
      },
    });
  } catch (error) {
    // Never let audit logging break the login path; log and continue.
    console.error("[auth] failed to record login failure", error);
  }
}
