import { describe, expect, it } from "vitest";
import {
  computeChange,
  computeDiscountAmount,
  computeLineTotal,
  computeTotals,
  PricingError,
  requiresChangeCalculation,
} from "./engine";

/**
 * Pricing engine tests.
 *
 * The scenarios come straight from the shop's price board, so a regression here
 * shows up as "the Sedan total is wrong", not as an abstract assertion failure.
 */

const SEDAN = {
  bodyWash: "135.00",
  vacuum: "135.00",
  underWash: "135.00",
  engineCleaning: "90.00",
  bodyWax: "160.00",
};

function line(serviceId: string, unitPrice: string, quantity = 1) {
  return { serviceId, serviceName: serviceId, unitPrice, quantity };
}

describe("computeLineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(computeLineTotal("135.00", 3).toFixed(2)).toBe("405.00");
  });

  it("rounds to centavos with half-up", () => {
    expect(computeLineTotal("33.335", 1).toFixed(2)).toBe("33.34");
  });

  it("handles a zero price without error", () => {
    expect(computeLineTotal("0", 5).toFixed(2)).toBe("0.00");
  });
});

describe("computeTotals — the price board", () => {
  it("totals the documented Sedan basket to ₱430.00", () => {
    // Body Wash 135 + Vacuum 135 + Body Wax 160 — the worked example in the spec.
    const result = computeTotals({
      lines: [
        line("body-wash", SEDAN.bodyWash),
        line("vacuum", SEDAN.vacuum),
        line("body-wax", SEDAN.bodyWax),
      ],
    });

    expect(result.subtotal.toFixed(2)).toBe("430.00");
    expect(result.discountAmount.toFixed(2)).toBe("0.00");
    expect(result.total.toFixed(2)).toBe("430.00");
    expect(result.lines).toHaveLength(3);
  });

  it("prices every Sedan service together", () => {
    const result = computeTotals({
      lines: [
        line("body-wash", SEDAN.bodyWash),
        line("vacuum", SEDAN.vacuum),
        line("under-wash", SEDAN.underWash),
        line("engine-cleaning", SEDAN.engineCleaning),
        line("body-wax", SEDAN.bodyWax),
      ],
    });

    expect(result.total.toFixed(2)).toBe("655.00");
  });

  it("applies quantity to a single line", () => {
    const result = computeTotals({ lines: [line("body-wash", "125.00", 3)] });
    expect(result.subtotal.toFixed(2)).toBe("375.00");
  });

  it("adds additional charges after the discount", () => {
    const result = computeTotals({
      lines: [line("body-wash", "100.00")],
      discount: { kind: "FIXED_AMOUNT", value: "20.00" },
      additionalCharges: "50.00",
    });

    // 100 - 20 + 50
    expect(result.total.toFixed(2)).toBe("130.00");
  });

  it("does not accumulate floating point error across many lines", () => {
    const lines = Array.from({ length: 30 }, (_, index) => line(`s${index}`, "0.10"));
    expect(computeTotals({ lines }).total.toFixed(2)).toBe("3.00");
  });

  it("rejects an empty basket", () => {
    expect(() => computeTotals({ lines: [] })).toThrow(PricingError);
  });

  it("rejects the same service listed twice", () => {
    expect(() =>
      computeTotals({ lines: [line("body-wash", "135.00"), line("body-wash", "135.00")] }),
    ).toThrow(/twice/i);
  });

  it("rejects a fractional quantity", () => {
    expect(() => computeTotals({ lines: [line("body-wash", "135.00", 1.5)] })).toThrow(
      /whole number/i,
    );
  });

  it("rejects a quantity of zero or below", () => {
    expect(() => computeTotals({ lines: [line("body-wash", "135.00", 0)] })).toThrow(PricingError);
  });

  it("rejects a quantity above the cap", () => {
    expect(() => computeTotals({ lines: [line("body-wash", "135.00", 100)] })).toThrow(
      PricingError,
    );
  });

  it("rejects a negative unit price", () => {
    expect(() => computeTotals({ lines: [line("body-wash", "-1.00")] })).toThrow(/negative/i);
  });

  it("rejects negative additional charges", () => {
    expect(() =>
      computeTotals({ lines: [line("body-wash", "135.00")], additionalCharges: "-5" }),
    ).toThrow(/negative/i);
  });
});

describe("computeDiscountAmount", () => {
  it("computes a percentage of the subtotal", () => {
    expect(computeDiscountAmount("430.00", { kind: "PERCENTAGE", value: "10" }).toFixed(2)).toBe(
      "43.00",
    );
  });

  it("honours a peso cap on a percentage discount", () => {
    expect(
      computeDiscountAmount("1000.00", {
        kind: "PERCENTAGE",
        value: "50",
        maxAmount: "100.00",
      }).toFixed(2),
    ).toBe("100.00");
  });

  it("never discounts more than the subtotal", () => {
    expect(
      computeDiscountAmount("100.00", { kind: "FIXED_AMOUNT", value: "500.00" }).toFixed(2),
    ).toBe("100.00");
  });

  it("returns zero when there is no discount", () => {
    expect(computeDiscountAmount("430.00", null).toFixed(2)).toBe("0.00");
  });

  it("rejects a percentage above 100", () => {
    expect(() => computeDiscountAmount("100", { kind: "PERCENTAGE", value: "101" })).toThrow(
      /100%/,
    );
  });

  it("rejects a negative discount", () => {
    expect(() => computeDiscountAmount("100", { kind: "FIXED_AMOUNT", value: "-1" })).toThrow(
      /negative/i,
    );
  });
});

describe("computeTotals — discounts", () => {
  it("floors the total at zero rather than owing the customer money", () => {
    const result = computeTotals({
      lines: [line("body-wash", "100.00")],
      discount: { kind: "PERCENTAGE", value: "100" },
    });
    expect(result.total.toFixed(2)).toBe("0.00");
  });
});

describe("computeChange", () => {
  it("computes change for the documented ₱500 on a ₱430 sale", () => {
    const result = computeChange("430.00", "500.00");
    expect(result.isSufficient).toBe(true);
    expect(result.change.toFixed(2)).toBe("70.00");
    expect(result.shortfall.toFixed(2)).toBe("0.00");
  });

  it("accepts exact cash with no change", () => {
    const result = computeChange("430.00", "430.00");
    expect(result.isSufficient).toBe(true);
    expect(result.change.toFixed(2)).toBe("0.00");
  });

  it("reports the shortfall when cash is short", () => {
    const result = computeChange("430.00", "400.00");
    expect(result.isSufficient).toBe(false);
    expect(result.change.toFixed(2)).toBe("0.00");
    expect(result.shortfall.toFixed(2)).toBe("30.00");
  });

  it("is short by one centavo, not equal", () => {
    const result = computeChange("430.00", "429.99");
    expect(result.isSufficient).toBe(false);
    expect(result.shortfall.toFixed(2)).toBe("0.01");
  });

  it("rejects negative cash", () => {
    expect(() => computeChange("430.00", "-1")).toThrow(/negative/i);
  });
});

describe("requiresChangeCalculation", () => {
  it("is true only for cash", () => {
    expect(requiresChangeCalculation("CASH")).toBe(true);
    expect(requiresChangeCalculation("GCASH")).toBe(false);
    expect(requiresChangeCalculation("MAYA")).toBe(false);
    expect(requiresChangeCalculation("BANK_TRANSFER")).toBe(false);
    expect(requiresChangeCalculation("OTHER")).toBe(false);
  });
});
