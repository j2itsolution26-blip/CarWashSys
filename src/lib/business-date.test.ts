import { describe, expect, it } from "vitest";
import {
  businessDate,
  businessDateKey,
  businessDayRange,
  formatCustomerLabel,
  formatTransactionNumber,
} from "./business-date";

const MANILA = "Asia/Manila";

describe("business date", () => {
  it("uses the shop's timezone, not the server's", () => {
    // 2026-08-12 23:30 UTC is already 2026-08-13 07:30 in Manila.
    const at = new Date("2026-08-12T23:30:00.000Z");
    expect(businessDateKey(at, MANILA)).toBe("2026-08-13");
  });

  it("keeps early-morning work on the correct business day", () => {
    // 2026-08-12 01:00 Manila = 2026-08-11 17:00 UTC — still the 12th locally.
    const at = new Date("2026-08-11T17:00:00.000Z");
    expect(businessDateKey(at, MANILA)).toBe("2026-08-12");
  });

  it("anchors the stored date at UTC midnight", () => {
    const stored = businessDate(new Date("2026-08-12T23:30:00.000Z"), MANILA);
    expect(stored.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });

  it("produces a 24-hour range covering exactly one shop day", () => {
    const { start, end } = businessDayRange(new Date("2026-08-12T06:00:00.000Z"), MANILA);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // Manila is UTC+8, so local midnight is 16:00 UTC the previous day.
    expect(start.toISOString()).toBe("2026-08-11T16:00:00.000Z");
  });

  it("every instant inside the range maps to the same business date", () => {
    const at = new Date("2026-08-12T06:00:00.000Z");
    const { start, end } = businessDayRange(at, MANILA);
    const key = businessDateKey(at, MANILA);

    expect(businessDateKey(start, MANILA)).toBe(key);
    expect(businessDateKey(new Date(end.getTime() - 1), MANILA)).toBe(key);
    // One millisecond past the end belongs to the next day.
    expect(businessDateKey(end, MANILA)).not.toBe(key);
  });
});

describe("human numbering", () => {
  it("zero-pads transaction numbers to six digits", () => {
    expect(formatTransactionNumber(1)).toBe("TXN-000001");
    expect(formatTransactionNumber(42)).toBe("TXN-000042");
    expect(formatTransactionNumber(999999)).toBe("TXN-999999");
  });

  it("does not truncate once the sequence exceeds six digits", () => {
    expect(formatTransactionNumber(1000000)).toBe("TXN-1000000");
  });

  it("labels walk-in customers by number only — never by name", () => {
    expect(formatCustomerLabel(1)).toBe("Customer 1");
    expect(formatCustomerLabel(27)).toBe("Customer 27");
  });
});
