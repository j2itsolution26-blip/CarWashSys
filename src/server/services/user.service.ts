import "server-only";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { ROLE_KEYS } from "@/lib/permissions/permissions";
import type { SessionUser } from "@/lib/auth/guards";
import { recordAuditIn } from "./audit.service";

/**
 * Staff account administration.
 *
 * Two lock-out protections are enforced here regardless of who is calling:
 *   1. The last active OWNER can never be deactivated or demoted.
 *   2. A user cannot deactivate or demote themselves.
 * Both exist because a car wash locked out of its own POS on a Saturday morning
 * is an outage no password reset flow will fix quickly enough.
 */

export interface StaffListItem {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: Array<{ key: string; name: string }>;
  lastLoginAt: string | null;
  createdAt: string;
  transactionCount: number;
}

export async function listStaff(): Promise<StaffListItem[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      roles: { include: { role: { select: { key: true, name: true, sortOrder: true } } } },
      _count: { select: { createdTransactions: true } },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    roles: user.roles
      .map((link) => link.role)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((role) => ({ key: role.key, name: role.name })),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    transactionCount: user._count.createdTransactions,
  }));
}

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, name: true, description: true },
  });
}

/** Staff who can be assigned wash work. */
export async function listAssignableStaff() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { key: { in: [ROLE_KEYS.WASHER, ROLE_KEYS.CASHIER] } } } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

async function resolveRoleIds(roleKeys: string[]): Promise<string[]> {
  const roles = await prisma.role.findMany({
    where: { key: { in: roleKeys } },
    select: { id: true },
  });
  if (roles.length !== roleKeys.length) {
    throw notFound("One of the selected roles no longer exists.");
  }
  return roles.map((role) => role.id);
}

export async function createStaff(
  input: { name: string; email: string; password: string; roleKeys: string[] },
  actor: SessionUser,
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("An account with that email already exists.");

  const roleIds = await resolveRoleIds(input.roleKeys);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        /*
         * Staff created by an administrator are verified on creation: the admin
         * standing in the shop vouching for them IS the verification, and they
         * are given their password in person. Only self-registration (the owner)
         * has to prove control of a mailbox. Without this, every staff account
         * would be created unable to sign in.
         */
        emailVerified: true,
        emailVerifiedAt: new Date(),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });

    await recordAuditIn(tx, {
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      actor,
      summary: `Staff account created for ${user.name} (${user.email}) with role(s): ${input.roleKeys.join(", ")}`,
      after: { name: user.name, email: user.email, roles: input.roleKeys },
    });

    return user;
  });
}

export async function updateStaff(
  input: { id: string; name: string; email: string; roleKeys: string[]; isActive: boolean },
  actor: SessionUser,
) {
  const existing = await prisma.user.findUnique({
    where: { id: input.id },
    include: { roles: { include: { role: { select: { key: true } } } } },
  });
  if (!existing) throw notFound("That staff account could not be found.");

  const previousRoles = existing.roles.map((link) => link.role.key);
  const losingOwner = previousRoles.includes(ROLE_KEYS.OWNER) && !input.roleKeys.includes(ROLE_KEYS.OWNER);
  const beingDeactivated = existing.isActive && !input.isActive;

  if (existing.id === actor.id && (beingDeactivated || losingOwner)) {
    throw forbidden("You cannot remove your own access.");
  }

  if (losingOwner || beingDeactivated) {
    await assertNotLastOwner(existing.id, previousRoles);
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email: input.email, id: { not: input.id } },
    select: { id: true },
  });
  if (emailTaken) throw conflict("Another account already uses that email.");

  const roleIds = await resolveRoleIds(input.roleKeys);

  return prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: input.id } });

    const user = await tx.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        email: input.email,
        isActive: input.isActive,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });

    const changes: string[] = [];
    if (existing.name !== input.name) changes.push(`name → ${input.name}`);
    if (existing.email !== input.email) changes.push(`email → ${input.email}`);
    if (existing.isActive !== input.isActive) {
      changes.push(input.isActive ? "reactivated" : "deactivated");
    }
    if (previousRoles.sort().join() !== [...input.roleKeys].sort().join()) {
      changes.push(`roles → ${input.roleKeys.join(", ")}`);
    }

    await recordAuditIn(tx, {
      action: input.isActive ? "USER_UPDATED" : "USER_DEACTIVATED",
      entityType: "User",
      entityId: user.id,
      actor,
      summary: `${existing.name}: ${changes.length ? changes.join("; ") : "no changes"}`,
      before: { name: existing.name, email: existing.email, isActive: existing.isActive, roles: previousRoles },
      after: { name: input.name, email: input.email, isActive: input.isActive, roles: input.roleKeys },
    });

    return user;
  });
}

export async function resetStaffPassword(
  input: { id: string; password: string },
  actor: SessionUser,
) {
  const existing = await prisma.user.findUnique({ where: { id: input.id } });
  if (!existing) throw notFound("That staff account could not be found.");

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.id },
      // Resetting the password also clears any lockout — that is usually why
      // an owner is resetting it in the first place.
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });

    await recordAuditIn(tx, {
      action: "USER_PASSWORD_CHANGED",
      entityType: "User",
      entityId: input.id,
      actor,
      summary: `Password reset for ${existing.name} (${existing.email})`,
    });
  });
}

/** Refuse any change that would leave the business with no active owner. */
async function assertNotLastOwner(userId: string, roleKeys: string[]): Promise<void> {
  if (!roleKeys.includes(ROLE_KEYS.OWNER)) return;

  const otherOwners = await prisma.user.count({
    where: {
      id: { not: userId },
      isActive: true,
      roles: { some: { role: { key: ROLE_KEYS.OWNER } } },
    },
  });

  if (otherOwners === 0) {
    throw conflict(
      "This is the only active owner account. Create another owner before changing this one.",
    );
  }
}
