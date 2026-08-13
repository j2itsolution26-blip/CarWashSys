import "server-only";
import type { Prisma, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound, validation } from "@/lib/errors";
import { toAmountString } from "@/lib/money";
import { computeTotals, type DiscountInput, PricingError } from "@/lib/pricing/engine";
import {
  ACTIVE_QUEUE_STATUSES,
  assertTransition,
  InvalidTransitionError,
  STATUS_LABELS,
  STATUS_TIMESTAMP_FIELD,
  type TransactionStatusValue,
} from "@/lib/transactions/status-machine";
import { businessDate, businessDateKey, formatCustomerLabel, formatTransactionNumber } from "@/lib/business-date";
import { PERMISSIONS, canViewTransaction, hasPermission } from "@/lib/permissions/permissions";
import type { SessionUser } from "@/lib/auth/guards";
import type { TransactionDTO, TransactionSummaryDTO } from "@/types/dto";
import type { CreateTransactionInput } from "@/lib/validation/schemas";
import { recordAuditIn } from "./audit.service";
import { allocateCustomerNumber, allocateTransactionSequence } from "./counter.service";
import { resolveCurrentPrices } from "./pricing.service";

/**
 * Transaction lifecycle.
 *
 * THE CENTRAL RULE OF THIS FILE: the browser sends WHAT was selected; this file
 * decides what it COSTS. Every total written to the database is computed here
 * from prices read here, inside the same database transaction that writes them.
 * A client-supplied total is not merely ignored — the request schema rejects
 * the field outright.
 */

type TransactionClient = Prisma.TransactionClient;

const TRANSACTION_INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  payments: {
    orderBy: { createdAt: "asc" },
    include: { processedBy: { select: { name: true } } },
  },
  statusHistory: {
    orderBy: { createdAt: "asc" },
    include: { changedBy: { select: { name: true } } },
  },
  createdBy: { select: { id: true, name: true } },
  assignedStaff: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

/**
 * "Sedan Car" for single-tier categories, "Motorcycle 150–200cc" for tiered
 * ones, and `null` for a draft that has not had a vehicle picked yet.
 */
export function buildVehicleLabel(
  categoryName: string | null,
  variantName: string | null,
): string | null {
  if (!categoryName) return null;
  if (!variantName || variantName.toLowerCase() === "standard") return categoryName;
  return `${categoryName} ${variantName}`;
}

function toDTO(record: TransactionWithRelations): TransactionDTO {
  return {
    id: record.id,
    transactionNumber: record.transactionNumber,
    customerNumber: record.customerNumber,
    customerLabel: record.customerLabel,
    businessDate: record.businessDate.toISOString().slice(0, 10),

    categoryId: record.categoryId,
    variantId: record.variantId,
    vehicleCategoryName: record.vehicleCategoryName,
    vehicleVariantName: record.vehicleVariantName,
    vehicleLabel: buildVehicleLabel(record.vehicleCategoryName, record.vehicleVariantName),

    status: record.status as TransactionStatusValue,
    isPaid: record.paidAt !== null,
    isReadyForPayment: record.variantId !== null && record.items.length > 0,

    subtotal: toAmountString(record.subtotal),
    discountAmount: toAmountString(record.discountAmount),
    additionalCharges: toAmountString(record.additionalCharges),
    total: toAmountString(record.total),
    discountCode: record.discountCode,
    discountLabel: record.discountLabel,

    notes: record.notes,

    createdById: record.createdById,
    createdByName: record.createdBy.name,
    assignedStaffId: record.assignedStaffId,
    assignedStaffName: record.assignedStaff?.name ?? null,

    createdAt: record.createdAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
    queuedAt: record.queuedAt?.toISOString() ?? null,
    startedAt: record.startedAt?.toISOString() ?? null,
    qualityCheckAt: record.qualityCheckAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelReason: record.cancelReason,

    items: record.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      unitPrice: toAmountString(item.unitPrice),
      quantity: item.quantity,
      lineTotal: toAmountString(item.lineTotal),
    })),
    payments: record.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      status: payment.status,
      amountDue: toAmountString(payment.amountDue),
      amountTendered: toAmountString(payment.amountTendered),
      changeGiven: toAmountString(payment.changeGiven),
      referenceNumber: payment.referenceNumber,
      processedByName: payment.processedBy?.name ?? null,
      createdAt: payment.createdAt.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      voidReason: payment.voidReason,
    })),
    statusHistory: record.statusHistory.map((event) => ({
      id: event.id,
      fromStatus: (event.fromStatus as TransactionStatusValue | null) ?? null,
      toStatus: event.toStatus as TransactionStatusValue,
      note: event.note,
      changedByName: event.changedBy?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

/**
 * Look up and validate a discount code.
 * `requiresApproval` discounts need the manage permission — a cashier holding
 * only `discount:apply` can use everyday promos but not an unrestricted one.
 */
async function resolveDiscount(
  tx: TransactionClient,
  code: string | null | undefined,
  actor: SessionUser,
): Promise<{ id: string; code: string; label: string; input: DiscountInput; minSubtotal: string | null } | null> {
  if (!code) return null;

  if (!hasPermission(actor.permissions, PERMISSIONS.DISCOUNT_APPLY)) {
    throw forbidden("You do not have permission to apply discounts.");
  }

  const discount = await tx.discount.findUnique({ where: { code: code.toUpperCase() } });
  if (!discount || !discount.isActive) {
    throw validation("That discount code is not valid.");
  }

  const now = new Date();
  if (discount.validFrom && discount.validFrom > now) {
    throw validation("That discount is not active yet.");
  }
  if (discount.validUntil && discount.validUntil < now) {
    throw validation("That discount has expired.");
  }
  if (discount.requiresApproval && !hasPermission(actor.permissions, PERMISSIONS.DISCOUNT_MANAGE)) {
    throw forbidden("That discount needs owner or administrator approval.");
  }

  return {
    id: discount.id,
    code: discount.code,
    label: discount.name,
    minSubtotal: discount.minSubtotal ? toAmountString(discount.minSubtotal) : null,
    input: {
      kind: discount.type,
      value: toAmountString(discount.value),
      maxAmount: discount.maxAmount ? toAmountString(discount.maxAmount) : null,
    },
  };
}

/** Shared pricing path used by both create and edit, so they can never diverge. */
async function priceTransaction(
  tx: TransactionClient,
  input: {
    variantId: string;
    items: { serviceId: string; quantity: number }[];
    discountCode?: string | null;
    additionalCharges?: string | null;
  },
  actor: SessionUser,
) {
  const variant = await tx.vehicleVariant.findUnique({
    where: { id: input.variantId },
    select: {
      id: true,
      name: true,
      isActive: true,
      category: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (!variant) throw notFound("That vehicle type could not be found.");
  if (!variant.isActive || !variant.category.isActive) {
    throw conflict("That vehicle type is no longer available. Pick another.");
  }

  const prices = await resolveCurrentPrices(
    tx,
    variant.id,
    input.items.map((item) => item.serviceId),
  );

  // Quantity is only honoured where the service allows it; otherwise a stray
  // qty=3 in a crafted payload would triple the charge.
  for (const item of input.items) {
    const price = prices.get(item.serviceId)!;
    if (item.quantity > 1 && !price.allowsQuantity) {
      throw validation(`${price.serviceName} cannot be added more than once.`);
    }
  }

  const discount = await resolveDiscount(tx, input.discountCode, actor);

  let totals;
  try {
    totals = computeTotals({
      lines: input.items.map((item) => {
        const price = prices.get(item.serviceId)!;
        return {
          serviceId: item.serviceId,
          serviceName: price.serviceName,
          unitPrice: price.unitPrice,
          quantity: item.quantity,
        };
      }),
      discount: discount?.input ?? null,
      additionalCharges: input.additionalCharges ?? 0,
    });
  } catch (error) {
    if (error instanceof PricingError) throw validation(error.message);
    throw error;
  }

  if (discount?.minSubtotal && totals.subtotal.lessThan(discount.minSubtotal)) {
    throw validation(
      `That discount needs a subtotal of at least ₱${discount.minSubtotal}.`,
    );
  }

  return { variant, prices, discount, totals };
}

export interface CreateTransactionResult {
  transaction: TransactionDTO;
  /** True when an identical submit had already been processed. */
  deduplicated: boolean;
}

/**
 * Open a new numbered transaction — the "+ New Transaction" button.
 *
 * Allocates "Customer N" and "TXN-NNNNNN" immediately, before a vehicle is
 * chosen, so the cashier can call the number out to the customer straight away.
 * The row starts empty and priced at zero; `updateTransactionItems` fills in the
 * vehicle and services and prices it server-side.
 *
 * Idempotent on `idempotencyKey`, so a double-tap on the button cannot burn two
 * customer numbers.
 */
export async function createDraftTransaction(
  idempotencyKey: string,
  actor: SessionUser,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreateTransactionResult> {
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    include: TRANSACTION_INCLUDE,
  });
  if (existing) return { transaction: toDTO(existing), deduplicated: true };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const dateKey = businessDateKey(now);
      const sequence = await allocateTransactionSequence(tx);
      const customerNumber = await allocateCustomerNumber(tx, dateKey);

      const record = await tx.transaction.create({
        data: {
          transactionNumber: formatTransactionNumber(sequence),
          customerNumber,
          customerLabel: formatCustomerLabel(customerNumber),
          businessDate: businessDate(now),
          status: "PENDING",
          idempotencyKey,
          createdById: actor.id,
          statusHistory: {
            create: { toStatus: "PENDING", changedById: actor.id, note: "Transaction opened" },
          },
        },
        include: TRANSACTION_INCLUDE,
      });

      await recordAuditIn(tx, {
        action: "TRANSACTION_CREATED",
        entityType: "Transaction",
        entityId: record.id,
        actor,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
        summary: `${record.transactionNumber} opened for ${record.customerLabel}`,
      });

      return record;
    });

    return { transaction: toDTO(created), deduplicated: false };
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) {
      const winner = await prisma.transaction.findUnique({
        where: { idempotencyKey },
        include: TRANSACTION_INCLUDE,
      });
      if (winner) return { transaction: toDTO(winner), deduplicated: true };
    }
    throw error;
  }
}

/**
 * Create a priced, PENDING transaction.
 *
 * IDEMPOTENCY: the caller supplies a key generated once per checkout attempt.
 * A double-click, a browser refresh mid-submit, or a network retry replays the
 * same key and receives the ORIGINAL transaction instead of creating a second
 * one. The unique index on `idempotencyKey` makes this a database guarantee, so
 * even two simultaneous requests cannot both win.
 */
export async function createTransaction(
  input: CreateTransactionInput,
  actor: SessionUser,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreateTransactionResult> {
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: TRANSACTION_INCLUDE,
  });
  if (existing) {
    return { transaction: toDTO(existing), deduplicated: true };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const { variant, prices, discount, totals } = await priceTransaction(tx, input, actor);

      const now = new Date();
      const dateKey = businessDateKey(now);
      const sequence = await allocateTransactionSequence(tx);
      const customerNumber = await allocateCustomerNumber(tx, dateKey);

      const record = await tx.transaction.create({
        data: {
          transactionNumber: formatTransactionNumber(sequence),
          customerNumber,
          customerLabel: formatCustomerLabel(customerNumber),
          businessDate: businessDate(now),

          categoryId: variant.category.id,
          variantId: variant.id,
          vehicleCategoryName: variant.category.name,
          vehicleVariantName: variant.name,

          status: "PENDING",
          subtotal: totals.subtotal.toFixed(2),
          discountAmount: totals.discountAmount.toFixed(2),
          additionalCharges: totals.additionalCharges.toFixed(2),
          total: totals.total.toFixed(2),
          discountId: discount?.id ?? null,
          discountCode: discount?.code ?? null,
          discountLabel: discount?.label ?? null,

          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey,
          createdById: actor.id,

          items: {
            create: totals.lines.map((line) => {
              const price = prices.get(line.serviceId)!;
              return {
                serviceId: line.serviceId,
                servicePriceId: price.servicePriceId,
                serviceName: price.serviceName,
                unitPrice: line.unitPrice.toFixed(2),
                quantity: line.quantity,
                lineTotal: line.lineTotal.toFixed(2),
              };
            }),
          },
          statusHistory: {
            create: { toStatus: "PENDING", changedById: actor.id, note: "Transaction created" },
          },
        },
        include: TRANSACTION_INCLUDE,
      });

      await recordAuditIn(tx, {
        action: "TRANSACTION_CREATED",
        entityType: "Transaction",
        entityId: record.id,
        actor,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
        summary: `${record.transactionNumber} (${record.customerLabel}) created — ${
          buildVehicleLabel(record.vehicleCategoryName, record.vehicleVariantName) ?? "no vehicle"
        }, ₱${toAmountString(record.total)}`,
        after: {
          total: toAmountString(record.total),
          items: record.items.map((item) => ({
            service: item.serviceName,
            unitPrice: toAmountString(item.unitPrice),
            quantity: item.quantity,
          })),
        },
      });

      return record;
    });

    return { transaction: toDTO(created), deduplicated: false };
  } catch (error) {
    // Lost race on the idempotency key: another identical request committed
    // first. Return its result rather than surfacing a duplicate-key error.
    if (isUniqueViolation(error, "idempotencyKey")) {
      const winner = await prisma.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: TRANSACTION_INCLUDE,
      });
      if (winner) return { transaction: toDTO(winner), deduplicated: true };
    }
    throw error;
  }
}

/** Re-price an unpaid transaction after the cashier edits the basket. */
export async function updateTransactionItems(
  input: {
    transactionId: string;
    variantId: string;
    items: { serviceId: string; quantity: number }[];
    discountCode?: string | null;
    additionalCharges?: string | null;
    notes?: string | null;
  },
  actor: SessionUser,
): Promise<TransactionDTO> {
  const current = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, status: true, paidAt: true, createdById: true, transactionNumber: true, total: true },
  });

  if (!current) throw notFound("That transaction could not be found.");
  if (current.paidAt) {
    throw conflict("This transaction has already been paid and can no longer be edited.");
  }
  if (current.status !== "PENDING") {
    throw conflict(
      `Only pending transactions can be edited — this one is ${STATUS_LABELS[current.status as TransactionStatusValue]}.`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { variant, prices, discount, totals } = await priceTransaction(tx, input, actor);

    await tx.transactionItem.deleteMany({ where: { transactionId: input.transactionId } });

    const record = await tx.transaction.update({
      where: { id: input.transactionId },
      data: {
        categoryId: variant.category.id,
        variantId: variant.id,
        vehicleCategoryName: variant.category.name,
        vehicleVariantName: variant.name,
        subtotal: totals.subtotal.toFixed(2),
        discountAmount: totals.discountAmount.toFixed(2),
        additionalCharges: totals.additionalCharges.toFixed(2),
        total: totals.total.toFixed(2),
        discountId: discount?.id ?? null,
        discountCode: discount?.code ?? null,
        discountLabel: discount?.label ?? null,
        notes: input.notes ?? null,
        items: {
          create: totals.lines.map((line) => {
            const price = prices.get(line.serviceId)!;
            return {
              serviceId: line.serviceId,
              servicePriceId: price.servicePriceId,
              serviceName: price.serviceName,
              unitPrice: line.unitPrice.toFixed(2),
              quantity: line.quantity,
              lineTotal: line.lineTotal.toFixed(2),
            };
          }),
        },
      },
      include: TRANSACTION_INCLUDE,
    });

    await recordAuditIn(tx, {
      action: "TRANSACTION_UPDATED",
      entityType: "Transaction",
      entityId: record.id,
      actor,
      summary: `${record.transactionNumber} edited — total ₱${toAmountString(
        current.total,
      )} → ₱${toAmountString(record.total)}`,
      before: { total: toAmountString(current.total) },
      after: { total: toAmountString(record.total) },
    });

    return record;
  });

  return toDTO(updated);
}

/**
 * Move a transaction along its lifecycle.
 * Legality is decided by the state machine, not by the caller.
 */
export async function changeStatus(
  input: { transactionId: string; toStatus: TransactionStatusValue; note?: string | null },
  actor: SessionUser,
): Promise<TransactionDTO> {
  const current = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, status: true, paidAt: true, transactionNumber: true },
  });
  if (!current) throw notFound("That transaction could not be found.");

  const from = current.status as TransactionStatusValue;

  // PAID is reached by capturing a payment, never by moving a dropdown.
  if (input.toStatus === "PAID") {
    throw conflict("Record a payment to mark this transaction as paid.");
  }
  if (input.toStatus === "CANCELLED") {
    throw conflict("Use the cancel action to cancel a transaction.");
  }

  try {
    assertTransition(from, input.toStatus);
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new AppError("INVALID_TRANSITION", error.message);
    }
    throw error;
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[input.toStatus];

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: input.toStatus as TransactionStatus,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
        statusHistory: {
          create: {
            fromStatus: from as TransactionStatus,
            toStatus: input.toStatus as TransactionStatus,
            changedById: actor.id,
            note: input.note ?? null,
          },
        },
      },
      include: TRANSACTION_INCLUDE,
    });

    await recordAuditIn(tx, {
      action: "TRANSACTION_STATUS_CHANGED",
      entityType: "Transaction",
      entityId: record.id,
      actor,
      summary: `${record.transactionNumber}: ${STATUS_LABELS[from]} → ${STATUS_LABELS[input.toStatus]}`,
      before: { status: from },
      after: { status: input.toStatus },
    });

    return record;
  });

  return toDTO(updated);
}

/** Cancel an unpaid transaction. Paid transactions must be voided/refunded. */
export async function cancelTransaction(
  input: { transactionId: string; reason: string },
  actor: SessionUser,
): Promise<TransactionDTO> {
  const current = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, status: true, paidAt: true, transactionNumber: true, total: true },
  });
  if (!current) throw notFound("That transaction could not be found.");

  const from = current.status as TransactionStatusValue;

  if (current.paidAt) {
    throw conflict(
      "This transaction has been paid. Void the payment first if it needs to be reversed.",
    );
  }

  try {
    assertTransition(from, "CANCELLED");
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new AppError("INVALID_TRANSITION", error.message);
    }
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: input.reason,
        statusHistory: {
          create: {
            fromStatus: from as TransactionStatus,
            toStatus: "CANCELLED",
            changedById: actor.id,
            note: input.reason,
          },
        },
      },
      include: TRANSACTION_INCLUDE,
    });

    await recordAuditIn(tx, {
      action: "TRANSACTION_CANCELLED",
      entityType: "Transaction",
      entityId: record.id,
      actor,
      summary: `${record.transactionNumber} cancelled — ${input.reason}`,
      before: { status: from, total: toAmountString(current.total) },
      after: { status: "CANCELLED" },
    });

    return record;
  });

  return toDTO(updated);
}

export async function assignStaff(
  input: { transactionId: string; staffId: string | null },
  actor: SessionUser,
): Promise<TransactionDTO> {
  if (input.staffId) {
    const staff = await prisma.user.findFirst({
      where: { id: input.staffId, isActive: true },
      select: { id: true },
    });
    if (!staff) throw notFound("That staff member could not be found.");
  }

  const record = await prisma.transaction.update({
    where: { id: input.transactionId },
    data: { assignedStaffId: input.staffId },
    include: TRANSACTION_INCLUDE,
  });

  await recordAuditIn(prisma, {
    action: "TRANSACTION_UPDATED",
    entityType: "Transaction",
    entityId: record.id,
    actor,
    summary: input.staffId
      ? `${record.transactionNumber} assigned to ${record.assignedStaff?.name ?? "staff"}`
      : `${record.transactionNumber} unassigned`,
  });

  return toDTO(record);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTransaction(
  id: string,
  viewer: SessionUser,
): Promise<TransactionDTO> {
  const record = await prisma.transaction.findUnique({
    where: { id },
    include: TRANSACTION_INCLUDE,
  });
  if (!record) throw notFound("That transaction could not be found.");

  if (!canViewTransaction(viewer.permissions, viewer.id, record.createdById)) {
    // 404 rather than 403: do not confirm the existence of records the viewer
    // is not entitled to see.
    throw notFound("That transaction could not be found.");
  }

  return toDTO(record);
}

export interface TransactionListFilters {
  status?: TransactionStatusValue;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(
  filters: TransactionListFilters,
  viewer: SessionUser,
): Promise<{
  rows: TransactionSummaryDTO[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));

  const scope: Prisma.TransactionWhereInput = hasPermission(
    viewer.permissions,
    PERMISSIONS.TRANSACTION_READ_ALL,
  )
    ? {}
    : { createdById: viewer.id };

  const where: Prisma.TransactionWhereInput = {
    ...scope,
    ...(filters.status ? { status: filters.status as TransactionStatus } : {}),
    ...(filters.from || filters.to
      ? {
          businessDate: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { transactionNumber: { contains: filters.search, mode: "insensitive" } },
            { customerLabel: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: { select: { serviceName: true } },
        createdBy: { select: { name: true } },
        assignedStaff: { select: { name: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    rows: records.map((record) => ({
      id: record.id,
      transactionNumber: record.transactionNumber,
      customerLabel: record.customerLabel,
      vehicleLabel: buildVehicleLabel(record.vehicleCategoryName, record.vehicleVariantName),
      status: record.status as TransactionStatusValue,
      isPaid: record.paidAt !== null,
      total: toAmountString(record.total),
      itemCount: record.items.length,
      serviceNames: record.items.map((item) => item.serviceName),
      createdByName: record.createdBy.name,
      assignedStaffName: record.assignedStaff?.name ?? null,
      createdAt: record.createdAt.toISOString(),
      paidAt: record.paidAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Wash-floor board: everything actively being worked, oldest first. */
export async function getQueue(): Promise<TransactionSummaryDTO[]> {
  const records = await prisma.transaction.findMany({
    where: { status: { in: ACTIVE_QUEUE_STATUSES as unknown as TransactionStatus[] } },
    orderBy: { createdAt: "asc" },
    include: {
      items: { select: { serviceName: true } },
      createdBy: { select: { name: true } },
      assignedStaff: { select: { name: true } },
    },
  });

  return records.map((record) => ({
    id: record.id,
    transactionNumber: record.transactionNumber,
    customerLabel: record.customerLabel,
    vehicleLabel: buildVehicleLabel(record.vehicleCategoryName, record.vehicleVariantName),
    status: record.status as TransactionStatusValue,
    isPaid: record.paidAt !== null,
    total: toAmountString(record.total),
    itemCount: record.items.length,
    serviceNames: record.items.map((item) => item.serviceName),
    createdByName: record.createdBy.name,
    assignedStaffName: record.assignedStaff?.name ?? null,
    createdAt: record.createdAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
  }));
}

/** Unpaid, still-open transactions for the POS "resume" list. */
export async function getOpenTransactions(viewer: SessionUser): Promise<TransactionSummaryDTO[]> {
  const scope = hasPermission(viewer.permissions, PERMISSIONS.TRANSACTION_READ_ALL)
    ? {}
    : { createdById: viewer.id };

  const records = await prisma.transaction.findMany({
    where: { ...scope, status: "PENDING", paidAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      items: { select: { serviceName: true } },
      createdBy: { select: { name: true } },
      assignedStaff: { select: { name: true } },
    },
  });

  return records.map((record) => ({
    id: record.id,
    transactionNumber: record.transactionNumber,
    customerLabel: record.customerLabel,
    vehicleLabel: buildVehicleLabel(record.vehicleCategoryName, record.vehicleVariantName),
    status: record.status as TransactionStatusValue,
    isPaid: false,
    total: toAmountString(record.total),
    itemCount: record.items.length,
    serviceNames: record.items.map((item) => item.serviceName),
    createdByName: record.createdBy.name,
    assignedStaffName: record.assignedStaff?.name ?? null,
    createdAt: record.createdAt.toISOString(),
    paidAt: null,
  }));
}

function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; meta?: { target?: string[] | string } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (!target) return true;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}
