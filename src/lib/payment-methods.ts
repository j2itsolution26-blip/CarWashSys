/**
 * Payment method catalog.
 *
 * Pure module (no `server-only`) because both the payment screen and the
 * payment service need it — keeping one definition is what stops the UI
 * offering a method the server does not accept.
 */

export type PaymentMethodValue = "CASH" | "GCASH" | "MAYA" | "BANK_TRANSFER" | "OTHER";

export interface PaymentMethodConfig {
  value: PaymentMethodValue;
  label: string;
  /** Cashier keys a tendered amount and change is calculated. */
  isCash: boolean;
  /** A wallet/bank reference number can be recorded. */
  needsReference: boolean;
}

export const PAYMENT_METHODS: readonly PaymentMethodConfig[] = [
  { value: "CASH", label: "Cash", isCash: true, needsReference: false },
  { value: "GCASH", label: "GCash", isCash: false, needsReference: true },
  { value: "MAYA", label: "Maya", isCash: false, needsReference: true },
  { value: "BANK_TRANSFER", label: "Bank Transfer", isCash: false, needsReference: true },
  { value: "OTHER", label: "Other", isCash: false, needsReference: true },
];

export function describeMethod(method: string): string {
  return PAYMENT_METHODS.find((entry) => entry.value === method)?.label ?? "Other";
}
