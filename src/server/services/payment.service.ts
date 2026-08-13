import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, conflict, notFound, validation } from "@/lib/errors";
import { formatPeso, toAmountString } from "@/lib/money";
import { computeChange, PricingError, requiresChangeCalculation } from "@/lib/pricing/engine";
import { describeMethod } from "@/lib/payment-methods";
import { canTransition, type TransactionStatusValue } from "@/lib/transactions/status-machine";
import type { SessionUser } from "@/lib/auth/guards";
import type { CapturePaymentInput } from "@/lib/validation/schemas";
import type { TransactionDTO } from "@/types/dto";
import { recordAuditIn } from "./audit.service";
import { getTransaction } from "./transaction.service";

/**
 * Payment capture.
 *
 * Guarantees this module is responsible for:
 *
 *  * THE AMOUNT DUE COMES FROM THE DATABASE. The browser's idea of the total is
 *    never consulted — the transaction row is re-read inside the write
 *    transaction and that value is what must be covered.
 *  * A TRANSACTION CAN BE PAID ONCE. Enforced three ways: an early check on
 *    `paidAt`, a unique index on the payment idempotency key, and the write
 *    happening inside a single serialised database transaction.
 *  * CASH CANNOT BE SHORT. `computeChange` is re-run server-side; a tendered
 *    amount below the total is rejected with the exact shortfall.
 */

export interface CapturePaymentResult {
  transaction: TransactionDTO;
  paymentId: string;
  change: string;
  /** True when this exact payment had already been recorded. */
  deduplicated: boolean;
}

export async function capturePayment(
  input: CapturePaymentInput,
  actor: SessionUser,
  requestContext?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CapturePaymentResult> {
  // Fast path for an obvious replay (double-click, refresh, retry).
  const replay = await prisma.transactionPayment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, transactionId: true, changeGiven: true },
  });
  if (replay) {
    return {
      transaction: await getTransaction(replay.transactionId, actor),
      paymentId: replay.id,
      change: toAmountString(replay.changeGiven),
      deduplicated: true,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: input.transactionId },
        select: {
          id: true,
          transactionNumber: true,
          customerLabel: true,
          status: true,
          paidAt: true,
          total: true,
          variantId: true,
          _count: { select: { items: true } },
        },
      });

      if (!transaction) throw notFound("That transaction could not be found.");

      if (transaction.status === "CANCELLED") {
        throw conflict("This transaction was cancelled and cannot be paid.");
      }
      // A freshly-numbered draft has a total of ₱0.00 and nothing to charge for.
      if (!transaction.variantId || transaction._count.items === 0) {
        throw conflict("Select a vehicle and at least one service before taking payment.");
      }
      if (transaction.paidAt) {
        throw conflict(
          `${transaction.transactionNumber} has already been paid. Refresh to see the receipt.`,
        );
      }

      // Authoritative amount — from the row, not the request.
      const amountDue = toAmountString(transaction.total);

      let changeGiven = "0.00";

      if (requiresChangeCalculation(input.method)) {
        let result;
        try {
          result = computeChange(amountDue, input.amountTendered);
        } catch (error) {
          if (error instanceof PricingError) throw validation(error.message);
          throw error;
        }

        if (!result.isSufficient) {
          throw new AppError(
            "INSUFFICIENT_PAYMENT",
            `Cash received is ${formatPeso(result.shortfall)} short of the ${formatPeso(
              amountDue,
            )} total.`,
            { shortfall: result.shortfall.toFixed(2), amountDue },
          );
        }
        changeGiven = result.change.toFixed(2);
      } else if (toAmountString(input.amountTendered) !== amountDue) {
        // Digital wallets and bank transfers settle the exact amount; a mismatch
        // means the cashier keyed the wrong figure.
        throw validation(
          `A ${describeMethod(input.method)} payment must be exactly ${formatPeso(amountDue)}.`,
        );
      }

      const payment = await tx.transactionPayment.create({
        data: {
          transactionId: transaction.id,
          method: input.method as PaymentMethod,
          status: "CAPTURED",
          amountDue,
          amountTendered: toAmountString(input.amountTendered),
          changeGiven,
          referenceNumber: input.referenceNumber ?? null,
          idempotencyKey: input.idempotencyKey,
          processedById: actor.id,
        },
      });

      const currentStatus = transaction.status as TransactionStatusValue;
      /**
       * Money and the wash floor are tracked separately. Paying always stamps
       * `paidAt`; the visible status only moves to PAID when that is a legal
       * next step — a vehicle already being washed keeps its floor status and
       * simply becomes paid.
       */
      const shouldMoveToPaid = canTransition(currentStatus, "PAID");

      const updated = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          paidAt: new Date(),
          ...(shouldMoveToPaid
            ? {
                status: "PAID",
                statusHistory: {
                  create: {
                    fromStatus: currentStatus,
                    toStatus: "PAID",
                    changedById: actor.id,
                    note: `Paid by ${describeMethod(input.method)}`,
                  },
                },
              }
            : {}),
        },
        select: { id: true, transactionNumber: true },
      });

      await recordAuditIn(tx, {
        action: "PAYMENT_CAPTURED",
        entityType: "Transaction",
        entityId: transaction.id,
        actor,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
        summary: `${updated.transactionNumber} paid ${formatPeso(amountDue)} by ${describeMethod(
          input.method,
        )}${Number(changeGiven) > 0 ? ` (change ${formatPeso(changeGiven)})` : ""}`,
        after: {
          method: input.method,
          amountDue,
          amountTendered: toAmountString(input.amountTendered),
          changeGiven,
          referenceNumber: input.referenceNumber ?? null,
        },
      });

      return { paymentId: payment.id, changeGiven, transactionId: transaction.id };
    });

    return {
      transaction: await getTransaction(result.transactionId, actor),
      paymentId: result.paymentId,
      change: result.changeGiven,
      deduplicated: false,
    };
  } catch (error) {
    // Two identical payment submits raced; the loser reports the winner's result.
    if (isUniqueViolation(error, "idempotencyKey")) {
      const winner = await prisma.transactionPayment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, transactionId: true, changeGiven: true },
      });
      if (winner) {
        return {
          transaction: await getTransaction(winner.transactionId, actor),
          paymentId: winner.id,
          change: toAmountString(winner.changeGiven),
          deduplicated: true,
        };
      }
    }
    throw error;
  }
}

/**
 * Reverse a captured payment (owner/administrator only — the caller is
 * responsible for the permission check).
 *
 * The payment row is marked VOIDED rather than deleted: the fact that money was
 * taken and given back is exactly the kind of event an audit trail exists for.
 */
export async function voidPayment(
  input: { paymentId: string; reason: string },
  actor: SessionUser,
): Promise<TransactionDTO> {
  const payment = await prisma.transactionPayment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      status: true,
      amountDue: true,
      method: true,
      transactionId: true,
      transaction: { select: { transactionNumber: true, status: true } },
    },
  });

  if (!payment) throw notFound("That payment could not be found.");
  if (payment.status !== "CAPTURED") {
    throw conflict("That payment has already been voided or refunded.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.transactionPayment.update({
      where: { id: payment.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: input.reason },
    });

    const stillPaid = await tx.transactionPayment.count({
      where: { transactionId: payment.transactionId, status: "CAPTURED" },
    });

    if (stillPaid === 0) {
      const revertToPending = payment.transaction.status === "PAID";
      await tx.transaction.update({
        where: { id: payment.transactionId },
        data: {
          paidAt: null,
          ...(revertToPending
            ? {
                status: "PENDING",
                statusHistory: {
                  create: {
                    fromStatus: "PAID",
                    toStatus: "PENDING",
                    changedById: actor.id,
                    note: `Payment voided: ${input.reason}`,
                  },
                },
              }
            : {}),
        },
      });
    }

    await recordAuditIn(tx, {
      action: "PAYMENT_VOIDED",
      entityType: "Transaction",
      entityId: payment.transactionId,
      actor,
      summary: `${payment.transaction.transactionNumber}: ${formatPeso(
        payment.amountDue,
      )} ${describeMethod(payment.method)} payment voided — ${input.reason}`,
      before: { status: "CAPTURED" },
      after: { status: "VOIDED", reason: input.reason },
    });
  });

  return getTransaction(payment.transactionId, actor);
}

function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; meta?: { target?: string[] | string } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (!target) return true;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}

export type { Prisma };
