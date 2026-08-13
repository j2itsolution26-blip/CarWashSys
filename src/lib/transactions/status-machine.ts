/**
 * Transaction lifecycle state machine.
 *
 * WHY A MACHINE AND NOT A FREE ENUM FIELD: "Do not allow arbitrary status
 * changes." Every status write in the system goes through `assertTransition`,
 * so a vehicle cannot jump from PENDING to COMPLETED, and a cancelled job
 * cannot be resurrected.
 *
 * ON PAID: the shop may collect money on arrival (POS flow: create → pay →
 * queue → wash → complete) or at pickup (create → queue → wash → complete →
 * pay). Both orders are legal below. Because of that, `status` alone is NOT the
 * answer to "has this been paid?" — the authoritative fact is
 * `transaction.paidAt` / the captured payment row. `status` describes where the
 * vehicle is; `paidAt` describes where the money is. See `isPaid()`.
 *
 * Pure module: no Prisma import, so the whole graph is unit-testable.
 */

export const TRANSACTION_STATUSES = [
  "PENDING",
  "QUEUED",
  "WASHING",
  "QUALITY_CHECK",
  "COMPLETED",
  "PAID",
  "CANCELLED",
] as const;

export type TransactionStatusValue = (typeof TRANSACTION_STATUSES)[number];

/** Adjacency list of legal moves. Anything not listed here is rejected. */
const TRANSITIONS: Record<TransactionStatusValue, readonly TransactionStatusValue[]> = {
  // Freshly created and priced. Either take the money now, or start the job now.
  PENDING: ["PAID", "QUEUED", "CANCELLED"],
  // Paid upfront — the normal POS flow. Job still has to be done.
  PAID: ["QUEUED", "COMPLETED", "CANCELLED"],
  QUEUED: ["WASHING", "CANCELLED"],
  WASHING: ["QUALITY_CHECK", "CANCELLED"],
  // QC can send the vehicle back to the bay. Rework is a real thing.
  QUALITY_CHECK: ["COMPLETED", "WASHING", "CANCELLED"],
  // Work is done. If the customer pays at pickup, this is where money is taken.
  COMPLETED: ["PAID"],
  CANCELLED: [],
};

/** Statuses from which no further movement is possible. */
export const TERMINAL_STATUSES: readonly TransactionStatusValue[] = ["CANCELLED"];

/** Statuses the wash floor acts on, used by the queue board. */
export const ACTIVE_QUEUE_STATUSES: readonly TransactionStatusValue[] = [
  "QUEUED",
  "WASHING",
  "QUALITY_CHECK",
];

export const STATUS_LABELS: Record<TransactionStatusValue, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  WASHING: "Washing",
  QUALITY_CHECK: "Quality Check",
  COMPLETED: "Completed",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * Status presentation. Each entry pairs a colour with a distinct text label and
 * icon name so status is never communicated by colour alone (accessibility
 * requirement: "No color-only status indicators").
 */
export const STATUS_PRESENTATION: Record<
  TransactionStatusValue,
  { label: string; className: string; icon: string }
> = {
  PENDING: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
    icon: "clock",
  },
  QUEUED: {
    label: "Queued",
    className:
      "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
    icon: "list",
  },
  WASHING: {
    label: "Washing",
    className:
      "bg-indigo-100 text-indigo-900 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
    icon: "droplets",
  },
  QUALITY_CHECK: {
    label: "Quality Check",
    className:
      "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
    icon: "search-check",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
    icon: "circle-check",
  },
  PAID: {
    label: "Paid",
    className:
      "bg-green-100 text-green-900 ring-green-300 dark:bg-green-950 dark:text-green-200 dark:ring-green-800",
    icon: "banknote",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
    icon: "circle-x",
  },
};

export class InvalidTransitionError extends Error {
  readonly from: TransactionStatusValue;
  readonly to: TransactionStatusValue;

  constructor(from: TransactionStatusValue, to: TransactionStatusValue) {
    super(
      `Cannot move a transaction from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.` +
        (TRANSITIONS[from].length === 0
          ? ` ${STATUS_LABELS[from]} is a final state.`
          : ` Allowed next: ${TRANSITIONS[from].map((s) => STATUS_LABELS[s]).join(", ")}.`),
    );
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function nextStatuses(from: TransactionStatusValue): readonly TransactionStatusValue[] {
  return TRANSITIONS[from];
}

export function canTransition(
  from: TransactionStatusValue,
  to: TransactionStatusValue,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws `InvalidTransitionError` with a staff-readable message. */
export function assertTransition(
  from: TransactionStatusValue,
  to: TransactionStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal(status: TransactionStatusValue): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Payment truth. Deliberately based on the timestamp rather than the status,
 * because a job paid upfront moves on to QUEUED/WASHING/COMPLETED and must
 * still read as paid.
 */
export function isPaid(transaction: { paidAt: Date | string | null }): boolean {
  return transaction.paidAt !== null;
}

/** The timestamp column that a given status should stamp when entered. */
export const STATUS_TIMESTAMP_FIELD: Partial<
  Record<TransactionStatusValue, "queuedAt" | "startedAt" | "qualityCheckAt" | "completedAt" | "cancelledAt" | "paidAt">
> = {
  QUEUED: "queuedAt",
  WASHING: "startedAt",
  QUALITY_CHECK: "qualityCheckAt",
  COMPLETED: "completedAt",
  CANCELLED: "cancelledAt",
  PAID: "paidAt",
};
