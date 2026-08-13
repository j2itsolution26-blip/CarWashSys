import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Atomic allocation of human-facing sequence numbers.
 *
 * Called ONLY from inside an interactive Prisma transaction. The `upsert`
 * acquires a row lock on the counter for the rest of that transaction, so two
 * cashiers pressing "New Transaction" on two terminals in the same millisecond
 * serialise: one gets TXN-000001, the other waits and gets TXN-000002.
 *
 * A Postgres SEQUENCE would be faster but is non-transactional — it would leave
 * gaps in the receipt numbering whenever a checkout rolled back. For a document
 * an accountant reads, gapless beats fast.
 */

type TransactionClient = Prisma.TransactionClient;

export const COUNTER_SCOPES = {
  TRANSACTION: "transaction",
  CUSTOMER: "customer",
} as const;

/**
 * Increment and return the next value for `scope`/`key`.
 * First call for a key creates it at 1.
 */
export async function allocateNumber(
  tx: TransactionClient,
  scope: string,
  key: string,
): Promise<number> {
  try {
    const counter = await tx.counter.upsert({
      where: { scope_key: { scope, key } },
      create: { scope, key, value: 1 },
      update: { value: { increment: 1 } },
    });
    return counter.value;
  } catch (error) {
    /*
     * The very first allocation for a key (the day's first customer, or the
     * shop's first ever sale) has no row to lock, so two simultaneous requests
     * can both attempt the INSERT and one loses on the primary key. The row now
     * definitely exists, so a plain increment succeeds. This only ever runs
     * once per counter key.
     */
    if (isUniqueViolation(error)) {
      const counter = await tx.counter.update({
        where: { scope_key: { scope, key } },
        data: { value: { increment: 1 } },
      });
      return counter.value;
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Global, never-resetting receipt sequence. */
export async function allocateTransactionSequence(tx: TransactionClient): Promise<number> {
  return allocateNumber(tx, COUNTER_SCOPES.TRANSACTION, "global");
}

/**
 * Per-business-day walk-in counter, so the cashier calls out "Customer 1" each
 * morning rather than "Customer 4,271".
 */
export async function allocateCustomerNumber(
  tx: TransactionClient,
  businessDateKey: string,
): Promise<number> {
  return allocateNumber(tx, COUNTER_SCOPES.CUSTOMER, businessDateKey);
}
