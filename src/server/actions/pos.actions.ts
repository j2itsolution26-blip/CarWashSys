"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext, requirePermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import {
  assignStaffSchema,
  cancelTransactionSchema,
  capturePaymentSchema,
  changeStatusSchema,
  createTransactionSchema,
  updateTransactionItemsSchema,
} from "@/lib/validation/schemas";
import { capturePayment, voidPayment } from "@/server/services/payment.service";
import {
  assignStaff,
  cancelTransaction,
  changeStatus,
  createDraftTransaction,
  createTransaction,
  updateTransactionItems,
} from "@/server/services/transaction.service";
import { idempotencyKeySchema } from "@/lib/validation/schemas";
import type { ActionResult, TransactionDTO } from "@/types/dto";
import { runAction } from "./action-result";

/**
 * POS server actions.
 *
 * Each one: check permission → validate input → call the service → revalidate.
 * The permission check is FIRST and unconditional. Note that none of these
 * accept a price or a total; see `createTransactionSchema`.
 */

/**
 * "+ New Transaction" — allocates the customer number and receipt number up
 * front so the cashier can call out "Customer 4" before touching the vehicle
 * tiles. Idempotent: a double-tap returns the same transaction.
 */
export async function openTransactionAction(
  idempotencyKey: string,
): Promise<ActionResult<{ transaction: TransactionDTO; deduplicated: boolean }>> {
  return runAction("openTransaction", async () => {
    const actor = await requirePermission(PERMISSIONS.POS_OPERATE);
    const key = idempotencyKeySchema.parse(idempotencyKey);
    const context = await getRequestContext();

    const result = await createDraftTransaction(key, actor, context);

    revalidatePath("/pos");
    revalidatePath("/transactions");

    return result;
  });
}

export async function createTransactionAction(
  input: unknown,
): Promise<ActionResult<{ transaction: TransactionDTO; deduplicated: boolean }>> {
  return runAction("createTransaction", async () => {
    const actor = await requirePermission(PERMISSIONS.POS_OPERATE);
    const payload = createTransactionSchema.parse(input);
    const context = await getRequestContext();

    const result = await createTransaction(payload, actor, context);

    revalidatePath("/pos");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return result;
  });
}

export async function updateTransactionAction(
  input: unknown,
): Promise<ActionResult<TransactionDTO>> {
  return runAction("updateTransaction", async () => {
    const actor = await requirePermission(PERMISSIONS.POS_OPERATE);
    const payload = updateTransactionItemsSchema.parse(input);

    const transaction = await updateTransactionItems(payload, actor);

    revalidatePath("/pos");
    revalidatePath(`/transactions/${payload.transactionId}`);

    return transaction;
  });
}

export async function capturePaymentAction(
  input: unknown,
): Promise<
  ActionResult<{
    transaction: TransactionDTO;
    paymentId: string;
    change: string;
    deduplicated: boolean;
  }>
> {
  return runAction("capturePayment", async () => {
    const actor = await requirePermission(PERMISSIONS.PAYMENT_CAPTURE);
    const payload = capturePaymentSchema.parse(input);
    const context = await getRequestContext();

    const result = await capturePayment(payload, actor, context);

    revalidatePath("/pos");
    revalidatePath("/queue");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return result;
  });
}

export async function changeStatusAction(input: unknown): Promise<ActionResult<TransactionDTO>> {
  return runAction("changeStatus", async () => {
    const actor = await requirePermission(PERMISSIONS.QUEUE_UPDATE);
    const payload = changeStatusSchema.parse(input);

    const transaction = await changeStatus(payload, actor);

    revalidatePath("/queue");
    revalidatePath("/transactions");
    revalidatePath(`/transactions/${payload.transactionId}`);
    revalidatePath("/dashboard");

    return transaction;
  });
}

export async function cancelTransactionAction(
  input: unknown,
): Promise<ActionResult<TransactionDTO>> {
  return runAction("cancelTransaction", async () => {
    const actor = await requirePermission(PERMISSIONS.TRANSACTION_CANCEL);
    const payload = cancelTransactionSchema.parse(input);

    const transaction = await cancelTransaction(payload, actor);

    revalidatePath("/queue");
    revalidatePath("/transactions");
    revalidatePath(`/transactions/${payload.transactionId}`);
    revalidatePath("/dashboard");

    return transaction;
  });
}

export async function assignStaffAction(input: unknown): Promise<ActionResult<TransactionDTO>> {
  return runAction("assignStaff", async () => {
    const actor = await requirePermission(PERMISSIONS.QUEUE_UPDATE);
    const payload = assignStaffSchema.parse(input);

    const transaction = await assignStaff(payload, actor);

    revalidatePath("/queue");
    revalidatePath(`/transactions/${payload.transactionId}`);

    return transaction;
  });
}

export async function voidPaymentAction(
  paymentId: string,
  reason: string,
): Promise<ActionResult<TransactionDTO>> {
  return runAction("voidPayment", async () => {
    const actor = await requirePermission(PERMISSIONS.PAYMENT_VOID);

    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      throw new Error("Give a reason for voiding this payment.");
    }

    const transaction = await voidPayment({ paymentId, reason: trimmed }, actor);

    revalidatePath("/transactions");
    revalidatePath(`/transactions/${transaction.id}`);
    revalidatePath("/dashboard");

    return transaction;
  });
}
