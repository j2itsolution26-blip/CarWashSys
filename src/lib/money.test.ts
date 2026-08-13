import { describe, expect, it } from "vitest";
import { clampToZero, formatPeso, formatPesoCompact, money, sum, toAmountString } from "./money";

describe("money", () => {
  it("parses strings, numbers and decimal-like objects", () => {
    expect(money("135.00").toFixed(2)).toBe("135.00");
    expect(money(135).toFixed(2)).toBe("135.00");
    expect(money({ toString: () => "135.5" }).toFixed(2)).toBe("135.50");
  });

  it("throws on values that are not finite numbers", () => {
    expect(() => money("abc")).toThrow(TypeError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it("does not suffer binary floating point drift", () => {
    // The reason this module exists: 0.1 + 0.2 must be exactly 0.30.
    expect(money("0.1").plus(money("0.2")).toFixed(2)).toBe("0.30");
  });

  it("rounds half-up at the centavo, the way a cashier does", () => {
    expect(toAmountString("0.005")).toBe("0.01");
    expect(toAmountString("0.004")).toBe("0.00");
  });
});

describe("toAmountString", () => {
  it("always produces two decimal places", () => {
    expect(toAmountString("135")).toBe("135.00");
    expect(toAmountString("135.5")).toBe("135.50");
    expect(toAmountString(0)).toBe("0.00");
  });
});

describe("formatPeso", () => {
  it("formats with the peso sign and two decimals", () => {
    expect(formatPeso("135")).toBe("₱135.00");
    expect(formatPeso("430.5")).toBe("₱430.50");
  });

  it("groups thousands", () => {
    expect(formatPeso("1430")).toBe("₱1,430.00");
    expect(formatPeso("1234567.89")).toBe("₱1,234,567.89");
  });

  it("puts the minus sign before the peso symbol", () => {
    expect(formatPeso("-70")).toBe("-₱70.00");
  });
});

describe("formatPesoCompact", () => {
  it("drops trailing zero centavos for dense tiles", () => {
    expect(formatPesoCompact("135.00")).toBe("₱135");
    expect(formatPesoCompact("135.50")).toBe("₱135.50");
  });
});

describe("sum", () => {
  it("adds a list of amounts exactly", () => {
    expect(sum(["135.00", "135.00", "160.00"]).toFixed(2)).toBe("430.00");
  });

  it("returns zero for an empty list", () => {
    expect(sum([]).toFixed(2)).toBe("0.00");
  });
});

describe("clampToZero", () => {
  it("floors negatives at zero", () => {
    expect(clampToZero("-5").toFixed(2)).toBe("0.00");
    expect(clampToZero("5").toFixed(2)).toBe("5.00");
  });
});
