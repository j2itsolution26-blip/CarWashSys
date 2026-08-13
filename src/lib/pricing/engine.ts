/**
 * Centralised pricing engine.
 *
 * This is the single source of truth for "what does this cost". The POS screen
 * calls it to render an optimistic live total; the server calls the SAME
 * function with prices freshly read from the database before writing anything.
 * If the two ever disagree, the server's answer wins and the request is
 * rejected — see `TransactionService.createTransaction`.
 *
 * Pure: no Prisma, no React, no I/O. Every branch here is unit-tested.
 */
import { Money, type MoneyInput, type MoneyValue, clampToZero, money, toCentavos } from "@/lib/money";

export const MAX_QUANTITY = 99;
export const MIN_QUANTITY = 1;

export type DiscountKind = "PERCENTAGE" | "FIXED_AMOUNT";

export interface PricedLineInput {
  serviceId: string;
  serviceName: string;
  /** Unit price as read from the database. Never supplied by the browser. */
  unitPrice: MoneyInput;
  quantity: number;
}

export interface PricedLine extends Omit<PricedLineInput, "unitPrice"> {
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
}

export interface DiscountInput {
  kind: DiscountKind;
  /** Percent 0–100 for PERCENTAGE, peso amount for FIXED_AMOUNT. */
  value: MoneyInput;
  /** Optional peso cap on a percentage discount. */
  maxAmount?: MoneyInput | null;
}

export interface PricingInput {
  lines: PricedLineInput[];
  discount?: DiscountInput | null;
  additionalCharges?: MoneyInput | null;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: MoneyValue;
  discountAmount: MoneyValue;
  additionalCharges: MoneyValue;
  total: MoneyValue;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function assertValidQuantity(quantity: number, serviceName: string): void {
  if (!Number.isInteger(quantity)) {
    throw new PricingError(`Quantity for ${serviceName} must be a whole number.`);
  }
  if (quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    throw new PricingError(
      `Quantity for ${serviceName} must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`,
    );
  }
}

/** `unit price x quantity`, rounded to centavos. */
export function computeLineTotal(unitPrice: MoneyInput, quantity: number): MoneyValue {
  return toCentavos(money(unitPrice).times(quantity));
}

/**
 * Resolve a discount into an absolute peso amount.
 * A discount can never exceed the subtotal — the total floors at zero, it never
 * turns into money owed to the customer.
 */
export function computeDiscountAmount(
  subtotal: MoneyInput,
  discount: DiscountInput | null | undefined,
): MoneyValue {
  const base = toCentavos(subtotal);
  if (!discount) return new Money(0);

  const value = money(discount.value);
  if (value.isNegative()) {
    throw new PricingError("Discount value cannot be negative.");
  }

  let amount: MoneyValue;
  if (discount.kind === "PERCENTAGE") {
    if (value.greaterThan(100)) {
      throw new PricingError("A percentage discount cannot exceed 100%.");
    }
    amount = toCentavos(base.times(value).dividedBy(100));
    if (discount.maxAmount !== null && discount.maxAmount !== undefined) {
      const cap = toCentavos(discount.maxAmount);
      if (amount.greaterThan(cap)) amount = cap;
    }
  } else {
    amount = toCentavos(value);
  }

  return amount.greaterThan(base) ? base : amount;
}

/**
 * The one calculation the whole business rests on:
 *
 *     subtotal - discount + additional charges = total
 */
export function computeTotals(input: PricingInput): PricingResult {
  if (input.lines.length === 0) {
    throw new PricingError("A transaction must contain at least one service.");
  }

  const seen = new Set<string>();
  const lines: PricedLine[] = input.lines.map((line) => {
    assertValidQuantity(line.quantity, line.serviceName);

    if (seen.has(line.serviceId)) {
      throw new PricingError(`${line.serviceName} was added twice — increase the quantity instead.`);
    }
    seen.add(line.serviceId);

    const unitPrice = toCentavos(line.unitPrice);
    if (unitPrice.isNegative()) {
      throw new PricingError(`${line.serviceName} has a negative price.`);
    }

    return {
      serviceId: line.serviceId,
      serviceName: line.serviceName,
      quantity: line.quantity,
      unitPrice,
      lineTotal: computeLineTotal(unitPrice, line.quantity),
    };
  });

  const subtotal = toCentavos(
    lines.reduce<MoneyValue>((acc, line) => acc.plus(line.lineTotal), new Money(0)),
  );

  const discountAmount = computeDiscountAmount(subtotal, input.discount);

  const additionalCharges = toCentavos(input.additionalCharges ?? 0);
  if (additionalCharges.isNegative()) {
    throw new PricingError("Additional charges cannot be negative.");
  }

  const total = clampToZero(subtotal.minus(discountAmount).plus(additionalCharges));

  return { lines, subtotal, discountAmount, additionalCharges: additionalCharges, total };
}

export interface ChangeResult {
  isSufficient: boolean;
  change: MoneyValue;
  shortfall: MoneyValue;
}

/**
 * Cash tendering. `isSufficient` is what gates the "Complete Payment" button in
 * the UI *and* what the payment service re-checks server-side.
 */
export function computeChange(total: MoneyInput, amountTendered: MoneyInput): ChangeResult {
  const due = toCentavos(total);
  const tendered = toCentavos(amountTendered);

  if (tendered.isNegative()) {
    throw new PricingError("Cash received cannot be negative.");
  }

  const difference = tendered.minus(due);
  return {
    isSufficient: difference.greaterThanOrEqualTo(0),
    change: clampToZero(difference),
    shortfall: clampToZero(difference.negated()),
  };
}

/**
 * Payment methods where the tendered amount is exactly the amount due and no
 * change is computed. Cash is the only method that involves a drawer.
 */
export const CASH_METHODS = new Set(["CASH"]);

export function requiresChangeCalculation(method: string): boolean {
  return CASH_METHODS.has(method);
}
