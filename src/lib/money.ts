/**
 * Money primitives for the POS.
 *
 * Every peso amount in this system is a decimal, never a JavaScript number.
 * `0.1 + 0.2 !== 0.3` is an interesting curiosity in most apps and a cash
 * drawer that does not reconcile in this one.
 *
 * This module has NO Prisma and NO React imports so the pricing engine that
 * builds on it can be unit-tested in milliseconds without a database.
 */
import Decimal from "decimal.js";

/**
 * An isolated Decimal constructor. Cloning rather than calling `Decimal.set()`
 * avoids mutating global decimal.js configuration that other libraries
 * (including Prisma's bundled copy) may rely on.
 *
 * ROUND_HALF_UP matches how a Philippine cashier rounds by hand: ₱0.005 goes up.
 */
export const Money = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
});

export type MoneyValue = InstanceType<typeof Money>;

/** Anything safely convertible to money: a string from the DB/wire, or a Decimal. */
export type MoneyInput = string | number | MoneyValue | { toString(): string };

export const ZERO: MoneyValue = new Money(0);

/**
 * Coerce untrusted input into a money value.
 * Throws on NaN/Infinity rather than silently producing a wrong total.
 */
export function money(value: MoneyInput): MoneyValue {
  let decimal: MoneyValue;
  try {
    decimal = new Money(typeof value === "object" ? value.toString() : value);
  } catch {
    // decimal.js raises its own DecimalError for unparseable input. Normalise it
    // so every caller can catch exactly one error type at the boundary.
    throw new TypeError(`Invalid monetary value: ${String(value)}`);
  }

  // Infinity and NaN parse successfully in decimal.js but are not money.
  if (!decimal.isFinite()) {
    throw new TypeError(`Invalid monetary value: ${String(value)}`);
  }
  return decimal;
}

/** Round to centavos. Applied at every boundary where an amount is stored. */
export function toCentavos(value: MoneyInput): MoneyValue {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Canonical string for the database and the wire: always 2 decimal places. */
export function toAmountString(value: MoneyInput): string {
  return toCentavos(value).toFixed(2);
}

/** Display format with thousands separators, e.g. `₱1,430.00`. */
export function formatPeso(value: MoneyInput): string {
  const amount = toCentavos(value);
  const negative = amount.isNegative();
  const [whole = "0", fraction = "00"] = amount.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${grouped}.${fraction}`;
}

/** Compact display without decimals for dense POS tiles, e.g. `₱135`. */
export function formatPesoCompact(value: MoneyInput): string {
  const amount = toCentavos(value);
  return amount.isInteger() ? formatPeso(amount).replace(/\.00$/, "") : formatPeso(amount);
}

export function sum(values: MoneyInput[]): MoneyValue {
  return values.reduce<MoneyValue>((total, value) => total.plus(money(value)), new Money(0));
}

export function isNegative(value: MoneyInput): boolean {
  return money(value).isNegative();
}

/** Clamp to zero — a total or a change amount is never allowed to go negative. */
export function clampToZero(value: MoneyInput): MoneyValue {
  const amount = money(value);
  return amount.isNegative() ? new Money(0) : amount;
}
