"use server";

import { cookies, headers } from "next/headers";
import {
  ownerRegistrationSchema,
  verifyOwnerCodeSchema,
} from "@/lib/validation/schemas";
import {
  cancelOwnerRegistration,
  getOwnerStatus,
  resendOwnerCode,
  startOwnerRegistration,
  verifyOwnerRegistration,
} from "@/server/services/owner-registration.service";
import type { MailOutcome } from "@/lib/mail/mailer";
import type { ActionResult } from "@/types/dto";
import { runAction } from "./action-result";

/**
 * Owner self-registration actions.
 *
 * CSRF: these are Next.js Server Actions, which are POST-only to an opaque,
 * per-build action id and are rejected by the framework when the Origin header
 * does not match the host. There is no GET route that mutates anything, and no
 * verification code or password ever appears in a URL.
 *
 * REGISTRATION STATE: held in an httpOnly cookie containing only the
 * registration id. The id alone is useless — completing the registration still
 * requires the code that was emailed — but keeping it out of JavaScript's reach
 * and out of the URL means a refresh, a new tab, or a shared screenshot cannot
 * leak or lose it.
 */

const REGISTRATION_COOKIE = "cg_owner_registration";
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // An hour: comfortably longer than the code TTL.

async function requestContext() {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null,
    userAgent: headerList.get("user-agent"),
  };
}

async function setRegistrationCookie(registrationId: string): Promise<void> {
  const store = await cookies();
  store.set(REGISTRATION_COOKIE, registrationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function getRegistrationCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(REGISTRATION_COOKIE)?.value ?? null;
}

async function clearRegistrationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(REGISTRATION_COOKIE);
}

/**
 * Step 1 — submit the registration form.
 *
 * Re-checks server-side that no owner exists, so hitting this action directly
 * (curl, a replayed request, a bookmarked form) is refused exactly as the UI
 * would refuse it.
 */
export async function startOwnerRegistrationAction(input: unknown): Promise<
  ActionResult<{
    maskedEmail: string;
    expiresAt: string;
    resendAvailableAt: string;
    delivery: MailOutcome;
  }>
> {
  return runAction("startOwnerRegistration", async () => {
    const payload = ownerRegistrationSchema.parse(input);
    const context = await requestContext();

    const result = await startOwnerRegistration(
      { name: payload.name, email: payload.email, password: payload.password },
      context,
    );

    await setRegistrationCookie(result.registrationId);

    // The registration id is deliberately the only thing that crosses to the
    // client. The code itself never appears in a payload, a cookie or a URL.
    return {
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      delivery: result.delivery,
    };
  });
}

/** Step 2 — submit the 6-digit code. */
export async function verifyOwnerCodeAction(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  return runAction("verifyOwnerCode", async () => {
    const payload = verifyOwnerCodeSchema.parse(input);
    const registrationId = await getRegistrationCookie();

    if (!registrationId) {
      throw new Error("Your registration session has expired. Please start again.");
    }

    const context = await requestContext();
    const result = await verifyOwnerRegistration(registrationId, payload.code, context);

    // The registration is spent; the cookie must not linger.
    await clearRegistrationCookie();

    return result;
  });
}

export async function resendOwnerCodeAction(): Promise<
  ActionResult<{
    expiresAt: string;
    resendAvailableAt: string;
    resendsRemaining: number;
    delivery: MailOutcome;
  }>
> {
  return runAction("resendOwnerCode", async () => {
    const registrationId = await getRegistrationCookie();
    if (!registrationId) {
      throw new Error("Your registration session has expired. Please start again.");
    }
    return resendOwnerCode(registrationId, await requestContext());
  });
}

/** Abandon the registration and free the pending slot. */
export async function cancelOwnerRegistrationAction(): Promise<ActionResult<null>> {
  return runAction("cancelOwnerRegistration", async () => {
    const registrationId = await getRegistrationCookie();
    if (registrationId) {
      await cancelOwnerRegistration(registrationId);
      await clearRegistrationCookie();
    }
    return null;
  });
}

export async function getOwnerStatusAction() {
  return getOwnerStatus();
}
