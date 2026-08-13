import bcrypt from "bcryptjs";

/**
 * Password hashing, isolated from `lib/auth/index.ts`.
 *
 * That module constructs NextAuth, which drags in React client internals.
 * Services that only need to hash a password (staff creation, owner
 * registration) import from here instead, so they stay loadable outside a
 * React server context.
 *
 * Cost 12 is the cost the seeded and admin-created accounts already use — it
 * must not be lowered without rehashing, or old and new hashes would verify at
 * different strengths.
 */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A real bcrypt hash of a random string, compared against when an email is
 * unknown so that "no such user" costs the same wall-clock time as "wrong
 * password". Without it, response timing reveals which staff emails exist.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$XwsGJncCdUc7eOEJjnWUXOqOjvUAkT/2uUFlqpN.70/FzEDxWn6gq";
