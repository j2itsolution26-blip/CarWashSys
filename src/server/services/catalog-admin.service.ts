import "server-only";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/guards";
import { recordAuditIn } from "./audit.service";

/**
 * Catalog administration: vehicle categories, variants and services.
 *
 * Deactivation, never deletion. A category that has been sold cannot be removed
 * without orphaning the receipts that reference it, so `isActive = false` takes
 * it off the POS while every historical transaction keeps rendering correctly.
 */

async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "item";
  let candidate = root;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Vehicle categories
// ---------------------------------------------------------------------------

export async function createCategory(
  input: { name: string; icon: string; description?: string | null; sortOrder: number },
  actor: SessionUser,
) {
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.vehicleCategory.findUnique({ where: { slug: candidate } })),
  );

  return prisma.$transaction(async (tx) => {
    const category = await tx.vehicleCategory.create({
      data: {
        name: input.name,
        slug,
        icon: input.icon,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
      },
    });

    // Every category needs at least one variant for pricing to attach to.
    await tx.vehicleVariant.create({
      data: { categoryId: category.id, name: "Standard", slug: "standard", sortOrder: 1 },
    });

    await recordAuditIn(tx, {
      action: "CATEGORY_CREATED",
      entityType: "VehicleCategory",
      entityId: category.id,
      actor,
      summary: `Vehicle category "${category.name}" created`,
      after: { name: category.name, icon: category.icon },
    });

    return category;
  });
}

export async function updateCategory(
  id: string,
  input: { name: string; icon: string; description?: string | null; sortOrder: number },
  actor: SessionUser,
) {
  const existing = await prisma.vehicleCategory.findUnique({ where: { id } });
  if (!existing) throw notFound("That vehicle category could not be found.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.vehicleCategory.update({
      where: { id },
      data: {
        name: input.name,
        icon: input.icon,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
      },
    });

    await recordAuditIn(tx, {
      action: "CATEGORY_UPDATED",
      entityType: "VehicleCategory",
      entityId: id,
      actor,
      summary: `Vehicle category "${existing.name}" updated`,
      before: { name: existing.name, icon: existing.icon, sortOrder: existing.sortOrder },
      after: { name: category.name, icon: category.icon, sortOrder: category.sortOrder },
    });

    return category;
  });
}

export async function setCategoryActive(id: string, isActive: boolean, actor: SessionUser) {
  const existing = await prisma.vehicleCategory.findUnique({ where: { id } });
  if (!existing) throw notFound("That vehicle category could not be found.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.vehicleCategory.update({ where: { id }, data: { isActive } });
    await recordAuditIn(tx, {
      action: "CATEGORY_DEACTIVATED",
      entityType: "VehicleCategory",
      entityId: id,
      actor,
      summary: `Vehicle category "${existing.name}" ${isActive ? "enabled" : "disabled"}`,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
    return category;
  });
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function createVariant(
  input: {
    categoryId: string;
    name: string;
    minDisplacementCc?: number | null;
    maxDisplacementCc?: number | null;
    sortOrder: number;
  },
  actor: SessionUser,
) {
  const category = await prisma.vehicleCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw notFound("That vehicle category could not be found.");

  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(
      await prisma.vehicleVariant.findUnique({
        where: { categoryId_slug: { categoryId: input.categoryId, slug: candidate } },
      }),
    ),
  );

  return prisma.$transaction(async (tx) => {
    const variant = await tx.vehicleVariant.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        slug,
        minDisplacementCc: input.minDisplacementCc ?? null,
        maxDisplacementCc: input.maxDisplacementCc ?? null,
        sortOrder: input.sortOrder,
      },
    });

    await recordAuditIn(tx, {
      action: "VARIANT_CREATED",
      entityType: "VehicleVariant",
      entityId: variant.id,
      actor,
      summary: `${category.name}: variant "${variant.name}" created`,
      after: { name: variant.name },
    });

    return variant;
  });
}

export async function setVariantActive(id: string, isActive: boolean, actor: SessionUser) {
  const existing = await prisma.vehicleVariant.findUnique({
    where: { id },
    include: { category: { select: { name: true } } },
  });
  if (!existing) throw notFound("That vehicle type could not be found.");

  return prisma.$transaction(async (tx) => {
    const variant = await tx.vehicleVariant.update({ where: { id }, data: { isActive } });
    await recordAuditIn(tx, {
      action: "VARIANT_DEACTIVATED",
      entityType: "VehicleVariant",
      entityId: id,
      actor,
      summary: `${existing.category.name} / ${existing.name} ${isActive ? "enabled" : "disabled"}`,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
    return variant;
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function createService(
  input: {
    name: string;
    description?: string | null;
    allowsQuantity: boolean;
    sortOrder: number;
  },
  actor: SessionUser,
) {
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.service.findUnique({ where: { slug: candidate } })),
  );

  return prisma.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        allowsQuantity: input.allowsQuantity,
        sortOrder: input.sortOrder,
      },
    });

    await recordAuditIn(tx, {
      action: "SERVICE_CREATED",
      entityType: "Service",
      entityId: service.id,
      actor,
      summary: `Service "${service.name}" created`,
      after: { name: service.name },
    });

    return service;
  });
}

export async function updateService(
  id: string,
  input: {
    name: string;
    description?: string | null;
    allowsQuantity: boolean;
    sortOrder: number;
  },
  actor: SessionUser,
) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw notFound("That service could not be found.");

  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        allowsQuantity: input.allowsQuantity,
        sortOrder: input.sortOrder,
      },
    });

    await recordAuditIn(tx, {
      action: "SERVICE_UPDATED",
      entityType: "Service",
      entityId: id,
      actor,
      summary: `Service "${existing.name}" updated`,
      before: { name: existing.name, sortOrder: existing.sortOrder },
      after: { name: service.name, sortOrder: service.sortOrder },
    });

    return service;
  });
}

export async function setServiceActive(id: string, isActive: boolean, actor: SessionUser) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw notFound("That service could not be found.");

  if (!isActive) {
    const openTransactions = await prisma.transactionItem.count({
      where: { serviceId: id, transaction: { status: "PENDING" } },
    });
    if (openTransactions > 0) {
      throw conflict(
        `"${existing.name}" is on ${openTransactions} open transaction${
          openTransactions === 1 ? "" : "s"
        }. Complete or cancel them first.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({ where: { id }, data: { isActive } });
    await recordAuditIn(tx, {
      action: "SERVICE_DEACTIVATED",
      entityType: "Service",
      entityId: id,
      actor,
      summary: `Service "${existing.name}" ${isActive ? "enabled" : "disabled"}`,
      before: { isActive: existing.isActive },
      after: { isActive },
    });
    return service;
  });
}
