"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/schemas";
import { getSessionUser } from "@/lib/auth/guards";
import { recordAudit } from "@/server/services/audit.service";
import type { ActionResult } from "@/types/dto";

/**
 * Sign-in / sign-out actions.
 *
 * The sign-in action deliberately returns a single generic message for any
 * credential failure, and only surfaces the specific message for states the
 * user genuinely needs to act on (locked or deactivated account).
 */

export async function signInAction(
  _previousState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Enter your email and password.",
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const cause = error.cause as { err?: Error } | undefined;
      const message = cause?.err?.message ?? "";
      // Lockout/deactivation messages are safe and actionable; anything else
      // collapses to the generic credential error.
      const isActionable = message.includes("locked") || message.includes("deactivated");
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: isActionable ? message : "Incorrect email or password.",
      };
    }
    throw error;
  }

  return { ok: true, data: null };
}

export async function signOutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await recordAudit({
      action: "USER_LOGOUT",
      entityType: "User",
      entityId: user.id,
      actor: user,
      summary: `${user.name} signed out`,
    });
  }
  await signOut({ redirectTo: "/login" });
}
