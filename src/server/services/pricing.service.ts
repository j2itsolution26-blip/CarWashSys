import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, notFound } from "@/lib/errors";
import { formatPeso, toAmountString } from "@/lib/money";
import type { SessionUser } from "@/lib/auth/guards";
import { recordAuditIn } from "./audit.service";

/**
 * Price authority.
 *
 * Two responsibilities, both of which are the reason this system exists:
 *
 *  1. RESOLVE — given a vehicle variant and a set of services, return the price
 *     the shop charges RIGHT NOW, read fresh from the database. Nothing the
 *     browser sends influences the result.
 *
 *  2. CHANGE — supersede a price without destroying history, so a receipt
 *     printed last month still reads ₱135 after today's increase to ₱150.
 */

type TransactionClient = Prisma.TransactionClient;

export interface ResolvedPrice {
  serviceId: string;
  servicePriceId: string;
  serviceName: string;
  unitPrice: string;
  allowsQuantity: boolean;
}

function currentKeyFor(variantId: string, serviceId: string): string {
  return `${variantId}:${serviceId}`;
}

/**
 * Read the live price for each requested service on the given variant.
 *
 * Throws if ANY requested service is unpriced, inactive, or not offered for
 * that vehicle — a partial sale at a guessed price is never acceptable.
 * Runs inside the caller's transaction so prices cannot change between
 * resolution and the write that depends on them.
 */
export async function resolveCurrentPrices(
  tx: TransactionClient,
  variantId: string,
  serviceIds: string[],
): Promise<Map<string, ResolvedPrice>> {
  const uniqueServiceIds = [...new Set(serviceIds)];

  const rows = await tx.servicePrice.findMany({
    where: {
      variantId,
      serviceId: { in: uniqueServiceIds },
      currentKey: { not: null },
      isActive: true,
      service: { isActive: true },
      variant: { isActive: true, category: { isActive: true } },
    },
    select: {
      id: true,
      amount: true,
      serviceId: true,
      service: { select: { name: true, allowsQuantity: true } },
    },
  });

  const resolved = new Map<string, ResolvedPrice>(
    rows.map((row) => [
      row.serviceId,
      {
        serviceId: row.serviceId,
        servicePriceId: row.id,
        serviceName: row.service.name,
        unitPrice: toAmountString(row.amount),
        allowsQuantity: row.service.allowsQuantity,
      },
    ]),
  );

  const missing = uniqueServiceIds.filter((id) => !resolved.has(id));
  if (missing.length > 0) {
    const names = await tx.service.findMany({
      where: { id: { in: missing } },
      select: { name: true },
    });
    const label = names.map((service) => service.name).join(", ") || "One or more services";
    throw new AppError(
      "PRICE_UNAVAILABLE",
      `${label} is not available for this vehicle right now. Refresh the POS and try again.`,
      { missing },
    );
  }

  return resolved;
}

export interface ChangePriceInput {
  variantId: string;
  serviceId: string;
  /** New amount as a decimal string, already validated at the boundary. */
  amount: string;
  note?: string | null;
}

/**
 * Supersede the current price with a new one.
 *
 * Implemented as close-then-insert inside one database transaction:
 *   old row: effectiveTo = now, currentKey = NULL   (history, never edited)
 *   new row: effectiveFrom = now, currentKey = set  (the live price)
 *
 * The unique index on `currentKey` means two admins saving different prices at
 * the same moment cannot both win — the loser gets a conflict, not a silent
 * overwrite.
 */
export async function changePrice(
  input: ChangePriceInput,
  actor: SessionUser,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<{ previousAmount: string | null; newAmount: string }> {
  const [variant, service] = await Promise.all([
    prisma.vehicleVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
    prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { id: true, name: true },
    }),
  ]);

  if (!variant) throw notFound("That vehicle type no longer exists.");
  if (!service) throw notFound("That service no longer exists.");

  const key = currentKeyFor(input.variantId, input.serviceId);
  const vehicleLabel =
    variant.name === "Standard" ? variant.category.name : `${variant.category.name} ${variant.name}`;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.servicePrice.findUnique({ where: { currentKey: key } });

    if (existing && toAmountString(existing.amount) === toAmountString(input.amount)) {
      throw conflict("That is already the current price — nothing was changed.");
    }

    const now = new Date();

    if (existing) {
      await tx.servicePrice.update({
        where: { id: existing.id },
        data: { effectiveTo: now, currentKey: null },
      });
    }

    const created = await tx.servicePrice.create({
      data: {
        variantId: input.variantId,
        serviceId: input.serviceId,
        amount: input.amount,
        effectiveFrom: now,
        currentKey: key,
        isActive: true,
        note: input.note ?? null,
        createdById: actor.id,
      },
    });

    const previousAmount = existing ? toAmountString(existing.amount) : null;

    await recordAuditIn(tx, {
      action: existing ? "PRICE_CHANGED" : "PRICE_CREATED",
      entityType: "ServicePrice",
      entityId: created.id,
      actor,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent,
      summary: existing
        ? `${vehicleLabel} / ${service.name}: ${formatPeso(previousAmount!)} → ${formatPeso(input.amount)}`
        : `${vehicleLabel} / ${service.name} priced at ${formatPeso(input.amount)}`,
      before: existing ? { amount: previousAmount } : undefined,
      after: { amount: toAmountString(input.amount) },
    });

    return { previousAmount, newAmount: toAmountString(created.amount) };
  });
}

/**
 * Take a service off the menu for one vehicle type (or put it back) without
 * touching history. Old transactions keep their line items either way.
 */
export async function setPriceActive(
  priceId: string,
  isActive: boolean,
  actor: SessionUser,
): Promise<void> {
  const price = await prisma.servicePrice.findUnique({
    where: { id: priceId },
    select: {
      id: true,
      amount: true,
      currentKey: true,
      service: { select: { name: true } },
      variant: { select: { name: true, category: { select: { name: true } } } },
    },
  });

  if (!price) throw notFound("That price could not be found.");
  if (!price.currentKey) {
    throw conflict("That is a historical price and cannot be changed.");
  }

  const vehicleLabel =
    price.variant.name === "Standard"
      ? price.variant.category.name
      : `${price.variant.category.name} ${price.variant.name}`;

  await prisma.$transaction(async (tx) => {
    await tx.servicePrice.update({ where: { id: priceId }, data: { isActive } });
    await recordAuditIn(tx, {
      action: "PRICE_DEACTIVATED",
      entityType: "ServicePrice",
      entityId: priceId,
      actor,
      summary: `${vehicleLabel} / ${price.service.name} ${isActive ? "re-enabled" : "removed from the menu"}`,
      before: { isActive: !isActive },
      after: { isActive },
    });
  });
}

/** Full price timeline for one vehicle+service pair, newest first. */
export async function getPriceHistory(variantId: string, serviceId: string) {
  const rows = await prisma.servicePrice.findMany({
    where: { variantId, serviceId },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      amount: true,
      effectiveFrom: true,
      effectiveTo: true,
      isActive: true,
      note: true,
      currentKey: true,
      createdBy: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amount: toAmountString(row.amount),
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    isCurrent: row.currentKey !== null,
    isActive: row.isActive,
    note: row.note,
    changedBy: row.createdBy?.name ?? "System",
  }));
}
