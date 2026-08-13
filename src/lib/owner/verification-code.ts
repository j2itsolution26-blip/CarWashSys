/**
 * Verification-code primitives for owner self-registration.
 *
 * Pure and dependency-light so the rules below are unit-testable without a
 * database or a mail server.
 *
 * SECURITY POSTURE
 *  * The code is generated with `crypto.randomInt`, a CSPRNG — never `Math.random`,
 *    never a fixed value like 123456.
 *  * Only a bcrypt hash of the code is ever persisted. The plaintext exists in
 *    memory for the length of one request and in the email. It is never logged,
 *    never returned to the browser, and never placed in a URL.
 *  * Comparison goes through `bcrypt.compare`, which does not short-circuit on
 *    the first differing byte.
 */
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;

/** Wrong guesses allowed before the registration locks. */
export const MAX_VERIFICATION_ATTEMPTS = 5;
/** How long a locked registration stays locked. */
export const LOCKOUT_MINUTES = 15;

/** Total resends permitted per registration, and the gap between them. */
export const MAX_RESENDS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Bcrypt cost for codes. Lower than the cost 12 used for passwords because a
 * code lives for ten minutes behind a five-attempt limit, and verification runs
 * on the request path. The search space is still 1,000,000 with at most five
 * guesses per registration.
 */
const CODE_BCRYPT_ROUNDS = 10;

/**
 * A uniformly random 6-digit code, zero-padded.
 *
 * `randomInt(0, 1_000_000)` is rejection-sampled by Node, so every value from
 * "000000" to "999999" is equally likely — no modulo bias.
 */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, "0");
}

export async function hashVerificationCode(code: string): Promise<string> {
  return bcrypt.hash(code, CODE_BCRYPT_ROUNDS);
}

export async function verifyCodeHash(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export function codeExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
}

export function isCodeExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Shape a submitted code before comparison: strip spaces/dashes users paste in. */
export function normaliseSubmittedCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isWellFormedCode(input: string): boolean {
  return /^\d{6}$/.test(normaliseSubmittedCode(input));
}

// ---------------------------------------------------------------------------
// Gmail validation
// ---------------------------------------------------------------------------

/**
 * The owner must register with a real Gmail address, because the account is
 * recovered through that mailbox.
 *
 * Deliberately strict: a valid local part, then exactly `@gmail.com` or
 * `@googlemail.com` (the same mailbox in some regions). Nothing else is
 * accepted, so `owner@gmail.com.attacker.net` is rejected.
 */
const GMAIL_PATTERN = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@(?:gmail|googlemail)\.com$/;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isGmailAddress(email: string): boolean {
  const normalised = normaliseEmail(email);
  if (normalised.length > 254) return false;
  // Consecutive dots are invalid in an address local part.
  if (normalised.includes("..")) return false;
  return GMAIL_PATTERN.test(normalised);
}

/**
 * `o••••••r@gmail.com` — shown on the verification screen so the user can check
 * they typed the right address, without printing it in full for a shoulder
 * surfer.
 */
export function maskEmail(email: string): string {
  const normalised = normaliseEmail(email);
  const [local = "", domain = ""] = normalised.split("@");
  if (local.length <= 2) return `${local}@${domain}`;
  const first = local.slice(0, 1);
  const last = local.slice(-1);
  return `${first}${"•".repeat(Math.min(local.length - 2, 8))}${last}@${domain}`;
}
