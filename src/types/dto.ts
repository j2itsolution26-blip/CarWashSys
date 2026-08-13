import type { TransactionStatusValue } from "@/lib/transactions/status-machine";

/**
 * Serialisable transfer objects.
 *
 * Prisma returns `Decimal` and `Date` instances, neither of which can cross the
 * React server/client boundary. Every service function converts to these shapes
 * first: money is a decimal STRING ("135.00"), time is an ISO string. This is
 * also why the POS can never accidentally do float arithmetic on a total.
 */

export interface TransactionItemDTO {
  id: string;
  serviceId: string;
  serviceName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface TransactionPaymentDTO {
  id: string;
  method: "CASH" | "GCASH" | "MAYA" | "BANK_TRANSFER" | "OTHER";
  status: "CAPTURED" | "VOIDED" | "REFUNDED";
  amountDue: string;
  amountTendered: string;
  changeGiven: string;
  referenceNumber: string | null;
  processedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface TransactionStatusEventDTO {
  id: string;
  fromStatus: TransactionStatusValue | null;
  toStatus: TransactionStatusValue;
  note: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface TransactionDTO {
  id: string;
  transactionNumber: string;
  customerNumber: number;
  customerLabel: string;
  businessDate: string;

  /** Null while the transaction is a numbered draft with no vehicle chosen yet. */
  categoryId: string | null;
  variantId: string | null;
  vehicleCategoryName: string | null;
  vehicleVariantName: string | null;
  /** "Sedan Car" or "Motorcycle 150–200cc" — what the receipt prints. */
  vehicleLabel: string | null;

  status: TransactionStatusValue;
  isPaid: boolean;
  /** False until a vehicle and at least one service have been selected. */
  isReadyForPayment: boolean;

  subtotal: string;
  discountAmount: string;
  additionalCharges: string;
  total: string;
  discountCode: string | null;
  discountLabel: string | null;

  notes: string | null;

  createdByName: string;
  createdById: string;
  assignedStaffName: string | null;
  assignedStaffId: string | null;

  createdAt: string;
  paidAt: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  qualityCheckAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  items: TransactionItemDTO[];
  payments: TransactionPaymentDTO[];
  statusHistory: TransactionStatusEventDTO[];
}

/** Compact row shape for lists and the queue board. */
export interface TransactionSummaryDTO {
  id: string;
  transactionNumber: string;
  customerLabel: string;
  vehicleLabel: string | null;
  status: TransactionStatusValue;
  isPaid: boolean;
  total: string;
  itemCount: number;
  serviceNames: string[];
  createdByName: string;
  assignedStaffName: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Uniform result envelope returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };
