import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { forbidden, unauthenticated } from "@/lib/errors";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type PermissionKey,
} from "@/lib/permissions/permissions";

/**
 * Server-side authorisation guards.
 *
 * THIS is the authorisation boundary — not the middleware, and certainly not
 * the UI. Every server action and route handler that mutates anything calls one
 * of these first. Hiding a button is a usability courtesy; this is the control.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? "Unknown",
    email: session.user.email ?? "",
    roles: session.user.roles ?? [],
    permissions: session.user.permissions ?? [],
  };
}

/** Any signed-in, still-active user. Throws `AppError('UNAUTHENTICATED')`. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, permission)) {
    throw forbidden(describeDenial(permission));
  }
  return user;
}

export async function requireAnyPermission(
  permissions: readonly PermissionKey[],
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAnyPermission(user.permissions, permissions)) {
    throw forbidden(describeDenial(permissions[0]));
  }
  return user;
}

export async function requireAllPermissions(
  permissions: readonly PermissionKey[],
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAllPermissions(user.permissions, permissions)) {
    throw forbidden(describeDenial(permissions[0]));
  }
  return user;
}

/** Non-throwing check for conditional rendering in server components. */
export async function userCan(permission: PermissionKey): Promise<boolean> {
  const user = await getSessionUser();
  return hasPermission(user?.permissions, permission);
}

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Client fingerprint for the audit trail. Best-effort; never trusted for auth. */
export async function getRequestContext(): Promise<RequestContext> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null,
    userAgent: headerList.get("user-agent"),
  };
}

const DENIAL_MESSAGES: Partial<Record<PermissionKey, string>> = {
  "pricing:manage": "Only an owner or administrator can change prices.",
  "catalog:manage": "Only an owner or administrator can change the service catalog.",
  "payment:void": "Only an owner or administrator can void a payment.",
  "payment:refund": "Only an owner or administrator can issue a refund.",
  "transaction:void": "Only an owner or administrator can void a transaction.",
  "transaction:cancel": "You do not have permission to cancel transactions.",
  "user:manage": "Only an owner or administrator can manage staff accounts.",
  "audit:read": "Only an owner or administrator can view the audit log.",
  "report:read": "Only an owner or administrator can view reports.",
  "discount:manage": "Only an owner or administrator can manage discounts.",
};

function describeDenial(permission: PermissionKey | undefined): string {
  if (!permission) return "You do not have permission to do that.";
  return DENIAL_MESSAGES[permission] ?? "You do not have permission to do that.";
}
