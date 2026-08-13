import "server-only";
import type { OwnerRegistration, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, notFound, validation } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { ROLE_KEYS } from "@/lib/permissions/permissions";
import {
  CODE_TTL_MINUTES,
  LOCKOUT_MINUTES,
  MAX_RESENDS,
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  codeExpiryFrom,
  generateVerificationCode,
  hashVerificationCode,
  isCodeExpired,
  isGmailAddress,
  maskEmail,
  normaliseEmail,
  verifyCodeHash,
} from "@/lib/owner/verification-code";
import { buildOwnerVerificationEmail } from "@/lib/mail/owner-verification-email";
import { sendMail, type MailOutcome } from "@/lib/mail/mailer";
import { recordAudit, recordAuditIn } from "./audit.service";

/**
 * One-time owner self-registration.
 *
 * THE CENTRAL GUARANTEE: there can never be more than one owner account. That is
 * enforced in three independent layers, in increasing order of authority:
 *
 *   1. UI      — the login page hides the link once an owner exists.
 *   2. Service — every entry point below re-checks `ownerExists()` server-side,
 *                so a hand-crafted POST or a bookmarked URL is refused.
 *   3. Database — `User.ownerSingleton` is a unique column holding `true` on the
 *                 owner and NULL on everyone else. Two requests that both pass
 *                 the service check and race to commit CANNOT both succeed; the
 *                 loser hits a unique violation and is rejected. Only layer 3 is
 *                 immune to race conditions, which is why it exists.
 *
 * `OwnerRegistration.activeKey` applies the same trick to the pending stage, so
 * a double-clicked submit or two simultaneous strangers cannot create two
 * pending registrations either.
 */

const ACTIVE_REGISTRATION_KEY = "owner";
const OWNER_EXISTS_MESSAGE =
  "An Owner account already exists. Owner registration is no longer available.";

export type OwnerState = "NONE" | "PENDING" | "ACTIVE";

export interface OwnerStatus {
  state: OwnerState;
  /** Masked address of the in-flight registration, for the "continue" prompt. */
  pendingEmail: string | null;
}

/** Is there an owner account in the database? The authoritative check. */
export async function ownerExists(client: Prisma.TransactionClient = prisma): Promise<boolean> {
  const count = await client.user.count({
    where: { roles: { some: { role: { key: ROLE_KEYS.OWNER } } } },
  });
  return count > 0;
}

/**
 * What the login page needs to decide whether to offer registration.
 * Read-only and safe to call unauthenticated — it leaks nothing but the
 * existence of an owner, which the presence of a login form already implies.
 */
export async function getOwnerStatus(): Promise<OwnerStatus> {
  if (await ownerExists()) {
    return { state: "ACTIVE", pendingEmail: null };
  }

  const pending = await findActiveRegistration();
  if (pending) {
    return { state: "PENDING", pendingEmail: maskEmail(pending.email) };
  }

  return { state: "NONE", pendingEmail: null };
}

/** The live registration, if one exists and has not expired. */
async function findActiveRegistration(): Promise<OwnerRegistration | null> {
  const registration = await prisma.ownerRegistration.findUnique({
    where: { activeKey: ACTIVE_REGISTRATION_KEY },
  });
  if (!registration) return null;
  if (registration.consumedAt) return null;

  // An expired registration is not "live" — it stops blocking a fresh attempt.
  // The code is expired but the row stays until superseded, so a user who is
  // mid-flow can still ask for a new code rather than being told to start over.
  return registration;
}

export interface StartRegistrationResult {
  registrationId: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  /**
   * How the code reached the user. `logged` means the dev console transport
   * printed it and no email exists — the UI must not claim one was sent.
   */
  delivery: MailOutcome;
}

/**
 * Step 1 — validate, reserve the single pending slot, email the code.
 *
 * Deliberate ordering: the registration row is written FIRST and the email is
 * sent SECOND, inside a try/catch that deletes the row if the send fails. The
 * alternative (send first) would let a successful email point at a registration
 * that was never stored.
 *
 * No User row is created here. A failed or abandoned registration therefore
 * leaves nothing behind that could be logged into.
 */
export async function startOwnerRegistration(
  input: { name: string; email: string; password: string },
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<StartRegistrationResult> {
  const email = normaliseEmail(input.email);

  // Layer 2, checked before anything is written.
  if (await ownerExists()) {
    await recordAudit({
      action: "OWNER_REGISTRATION_REJECTED",
      entityType: "OwnerRegistration",
      summary: `Blocked owner registration for ${maskEmail(email)} — an owner already exists`,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent,
    });
    throw conflict(OWNER_EXISTS_MESSAGE);
  }

  if (!isGmailAddress(email)) {
    throw validation("Please enter a valid Gmail address.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw conflict("An account with that email already exists.");
  }

  const existing = await findActiveRegistration();
  if (existing && !isCodeExpired(existing.codeExpiresAt)) {
    // Same person pressing the button twice, or refreshing the form: continue
    // the registration they already have instead of creating a second one.
    if (normaliseEmail(existing.email) === email) {
      // A resume, not a fresh send. The row only exists because an earlier
      // `sendMail` resolved — a failed send deletes it below — so the code that
      // is still live did reach the mailbox.
      return {
        registrationId: existing.id,
        maskedEmail: maskEmail(existing.email),
        expiresAt: existing.codeExpiresAt.toISOString(),
        resendAvailableAt: resendAvailableAt(existing).toISOString(),
        delivery: "sent",
      };
    }
    throw conflict(
      "An owner registration is already in progress. Finish that verification, or wait for it to expire.",
    );
  }

  const code = generateVerificationCode();
  const [passwordHash, codeHash] = await Promise.all([
    hashPassword(input.password),
    hashVerificationCode(code),
  ]);

  let registration: OwnerRegistration;
  try {
    registration = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction; the world may have changed since above.
      if (await ownerExists(tx)) throw conflict(OWNER_EXISTS_MESSAGE);

      // Release an expired slot so a new attempt can take it.
      if (existing) {
        await tx.ownerRegistration.update({
          where: { id: existing.id },
          data: { activeKey: null },
        });
      }

      return tx.ownerRegistration.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash,
          codeHash,
          codeExpiresAt: codeExpiryFrom(),
          activeKey: ACTIVE_REGISTRATION_KEY,
          lastSentAt: new Date(),
          ipAddress: requestContext?.ipAddress ?? null,
          userAgent: requestContext?.userAgent ?? null,
        },
      });
    });
  } catch (error) {
    // Two simultaneous first-time registrations: one takes the pending slot,
    // the other lands here.
    if (isUniqueViolation(error)) {
      throw conflict(
        "An owner registration is already in progress. Finish that verification, or wait for it to expire.",
      );
    }
    throw error;
  }

  let delivery: MailOutcome;
  try {
    ({ outcome: delivery } = await sendMail(
      buildOwnerVerificationEmail({
        to: email,
        name: registration.name,
        code,
        expiresInMinutes: CODE_TTL_MINUTES,
        businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH",
      }),
    ));
  } catch (error) {
    // The email never left. Roll the reservation back so the user can retry and
    // so the pending slot is not held by a registration nobody can complete.
    await prisma.ownerRegistration.delete({ where: { id: registration.id } }).catch(() => {});
    throw error;
  }

  await recordAudit({
    action: "OWNER_REGISTRATION_STARTED",
    entityType: "OwnerRegistration",
    entityId: registration.id,
    summary: `Owner registration started for ${maskEmail(email)}`,
    ipAddress: requestContext?.ipAddress,
    userAgent: requestContext?.userAgent,
  });

  return {
    registrationId: registration.id,
    maskedEmail: maskEmail(email),
    expiresAt: registration.codeExpiresAt.toISOString(),
    resendAvailableAt: resendAvailableAt(registration).toISOString(),
    delivery,
  };
}

export interface PendingRegistrationView {
  id: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsRemaining: number;
  resendsRemaining: number;
  lockedUntil: string | null;
}

/** Hydrate the verification screen from the registration id held in the cookie. */
export async function getPendingRegistration(
  registrationId: string,
): Promise<PendingRegistrationView | null> {
  const registration = await prisma.ownerRegistration.findUnique({
    where: { id: registrationId },
  });
  if (!registration || registration.consumedAt || !registration.activeKey) return null;

  return {
    id: registration.id,
    maskedEmail: maskEmail(registration.email),
    expiresAt: registration.codeExpiresAt.toISOString(),
    resendAvailableAt: resendAvailableAt(registration).toISOString(),
    attemptsRemaining: Math.max(0, MAX_VERIFICATION_ATTEMPTS - registration.attempts),
    resendsRemaining: Math.max(0, MAX_RESENDS - registration.resendCount),
    lockedUntil: registration.lockedUntil?.toISOString() ?? null,
  };
}

/**
 * Step 2 — confirm the code and create the owner.
 *
 * Activation is one database transaction: consume the registration, create the
 * user, attach the OWNER role, and claim the `ownerSingleton` flag. Any failure
 * rolls all four back together, so there is no state in which a user exists
 * without the role, or the code is spent without an account.
 */
export async function verifyOwnerRegistration(
  registrationId: string,
  submittedCode: string,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ email: string }> {
  const registration = await prisma.ownerRegistration.findUnique({
    where: { id: registrationId },
  });

  if (!registration || !registration.activeKey) {
    throw notFound("That registration could not be found. Please start again.");
  }
  if (registration.consumedAt) {
    throw conflict("That registration has already been completed. Please sign in.");
  }

  const now = new Date();

  if (registration.lockedUntil && registration.lockedUntil > now) {
    const minutes = Math.max(1, Math.ceil((registration.lockedUntil.getTime() - now.getTime()) / 60_000));
    throw new AppError(
      "RATE_LIMITED",
      `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  if (isCodeExpired(registration.codeExpiresAt, now)) {
    throw new AppError(
      "VALIDATION",
      "This verification code has expired. Please request a new code.",
    );
  }

  const matches = await verifyCodeHash(submittedCode, registration.codeHash);

  if (!matches) {
    const attempts = registration.attempts + 1;
    const shouldLock = attempts >= MAX_VERIFICATION_ATTEMPTS;

    await prisma.ownerRegistration.update({
      where: { id: registration.id },
      data: {
        attempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    await recordAudit({
      action: "OWNER_REGISTRATION_REJECTED",
      entityType: "OwnerRegistration",
      entityId: registration.id,
      summary: `Incorrect owner verification code for ${maskEmail(registration.email)} (attempt ${attempts})`,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent,
    });

    if (shouldLock) {
      throw new AppError(
        "RATE_LIMITED",
        `Too many incorrect codes. Verification is locked for ${LOCKOUT_MINUTES} minutes.`,
      );
    }

    const remaining = MAX_VERIFICATION_ATTEMPTS - attempts;
    throw validation(
      `Invalid verification code. Please try again. ${remaining} attempt${
        remaining === 1 ? "" : "s"
      } remaining.`,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (await ownerExists(tx)) throw conflict(OWNER_EXISTS_MESSAGE);

      // Consume the code first, conditioned on it still being unconsumed. If a
      // concurrent request got here first, this updates zero rows and throws.
      const consumed = await tx.ownerRegistration.updateMany({
        where: { id: registration.id, consumedAt: null },
        data: { consumedAt: now, activeKey: null },
      });
      if (consumed.count === 0) {
        throw conflict("That registration has already been completed. Please sign in.");
      }

      const ownerRole = await tx.role.findUnique({ where: { key: ROLE_KEYS.OWNER } });
      if (!ownerRole) {
        throw new AppError(
          "INTERNAL",
          "The owner role is missing. Run the database seed and try again.",
        );
      }

      const user = await tx.user.create({
        data: {
          name: registration.name,
          email: registration.email,
          passwordHash: registration.passwordHash,
          isActive: true,
          emailVerified: true,
          emailVerifiedAt: now,
          ownerSingleton: true,
          roles: { create: { roleId: ownerRole.id } },
        },
      });

      await recordAuditIn(tx, {
        action: "OWNER_REGISTRATION_VERIFIED",
        entityType: "User",
        entityId: user.id,
        actor: { id: user.id, name: user.name, email: user.email },
        summary: `Owner account created and verified for ${maskEmail(user.email)}`,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
      });
    });
  } catch (error) {
    // Layer 3 firing: another request claimed `ownerSingleton` first.
    if (isUniqueViolation(error)) {
      throw conflict(OWNER_EXISTS_MESSAGE);
    }
    throw error;
  }

  return { email: registration.email };
}

/**
 * Step 2b — resend.
 *
 * Generating a new code invalidates the old one by overwriting the stored hash,
 * so only the most recent email ever works. Guarded by a per-registration
 * cooldown and a hard cap, both to protect the user's inbox and to stop the
 * endpoint being used to send mail on someone else's behalf.
 */
export async function resendOwnerCode(
  registrationId: string,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{
  expiresAt: string;
  resendAvailableAt: string;
  resendsRemaining: number;
  delivery: MailOutcome;
}> {
  const registration = await prisma.ownerRegistration.findUnique({
    where: { id: registrationId },
  });

  if (!registration || !registration.activeKey || registration.consumedAt) {
    throw notFound("That registration could not be found. Please start again.");
  }

  if (await ownerExists()) {
    throw conflict(OWNER_EXISTS_MESSAGE);
  }

  const now = new Date();

  if (registration.resendCount >= MAX_RESENDS) {
    throw new AppError(
      "RATE_LIMITED",
      "You have requested too many codes. Please start the registration again later.",
    );
  }

  const availableAt = resendAvailableAt(registration);
  if (availableAt > now) {
    const seconds = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1000));
    throw new AppError("RATE_LIMITED", `Please wait ${seconds}s before requesting another code.`);
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const codeExpiresAt = codeExpiryFrom(now);

  // Sent BEFORE anything is written. If this throws, the function exits here:
  // the old code hash is untouched and still valid, `resendCount` is not
  // incremented, and `lastSentAt` does not move — so a failed send costs the
  // user neither their working code nor one of their resends.
  const { outcome: delivery } = await sendMail(
    buildOwnerVerificationEmail({
      to: registration.email,
      name: registration.name,
      code,
      expiresInMinutes: CODE_TTL_MINUTES,
      businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH",
    }),
  );

  // Written only after a successful send, so a failed resend leaves the previous
  // (still valid) code working rather than silently invalidating it.
  const updated = await prisma.ownerRegistration.update({
    where: { id: registration.id },
    data: {
      codeHash,
      codeExpiresAt,
      lastSentAt: now,
      resendCount: { increment: 1 },
      // A fresh code restores the attempt budget and clears any lockout.
      attempts: 0,
      lockedUntil: null,
    },
  });

  await recordAudit({
    action: "OWNER_CODE_RESENT",
    entityType: "OwnerRegistration",
    entityId: registration.id,
    summary: `Verification code resent to ${maskEmail(registration.email)} (${updated.resendCount}/${MAX_RESENDS})`,
    ipAddress: requestContext?.ipAddress,
    userAgent: requestContext?.userAgent,
  });

  return {
    expiresAt: codeExpiresAt.toISOString(),
    resendAvailableAt: resendAvailableAt(updated).toISOString(),
    resendsRemaining: Math.max(0, MAX_RESENDS - updated.resendCount),
    delivery,
  };
}

/** Abandon an in-flight registration so the pending slot is freed immediately. */
export async function cancelOwnerRegistration(registrationId: string): Promise<void> {
  await prisma.ownerRegistration
    .updateMany({
      where: { id: registrationId, consumedAt: null },
      data: { activeKey: null },
    })
    .catch(() => {});
}

function resendAvailableAt(registration: Pick<OwnerRegistration, "lastSentAt">): Date {
  return new Date(registration.lastSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}
