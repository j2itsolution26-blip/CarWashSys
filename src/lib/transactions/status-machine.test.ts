import { describe, expect, it } from "vitest";
import {
  ACTIVE_QUEUE_STATUSES,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isPaid,
  isTerminal,
  nextStatuses,
  STATUS_LABELS,
  STATUS_PRESENTATION,
  TRANSACTION_STATUSES,
  type TransactionStatusValue,
} from "./status-machine";

describe("status machine — legal moves", () => {
  it("allows the pay-first POS flow: PENDING → PAID → QUEUED → WASHING → QC → COMPLETED", () => {
    expect(canTransition("PENDING", "PAID")).toBe(true);
    expect(canTransition("PAID", "QUEUED")).toBe(true);
    expect(canTransition("QUEUED", "WASHING")).toBe(true);
    expect(canTransition("WASHING", "QUALITY_CHECK")).toBe(true);
    expect(canTransition("QUALITY_CHECK", "COMPLETED")).toBe(true);
  });

  it("allows the pay-at-pickup flow: PENDING → QUEUED → … → COMPLETED → PAID", () => {
    expect(canTransition("PENDING", "QUEUED")).toBe(true);
    expect(canTransition("COMPLETED", "PAID")).toBe(true);
  });

  it("allows quality check to send a vehicle back for rework", () => {
    expect(canTransition("QUALITY_CHECK", "WASHING")).toBe(true);
  });
});

describe("status machine — illegal moves", () => {
  it("refuses to skip the whole wash", () => {
    expect(canTransition("PENDING", "COMPLETED")).toBe(false);
  });

  it("refuses to jump straight to quality check", () => {
    expect(canTransition("QUEUED", "QUALITY_CHECK")).toBe(false);
  });

  it("refuses to go backwards from washing to queued", () => {
    expect(canTransition("WASHING", "QUEUED")).toBe(false);
  });

  it("refuses to resurrect a cancelled transaction", () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(canTransition("CANCELLED", status)).toBe(false);
    }
  });

  it("refuses to cancel work that is already complete", () => {
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("throws a staff-readable error naming the allowed moves", () => {
    expect(() => assertTransition("PENDING", "COMPLETED")).toThrow(InvalidTransitionError);
    try {
      assertTransition("PENDING", "COMPLETED");
    } catch (error) {
      expect((error as Error).message).toContain("Pending");
      expect((error as Error).message).toContain("Allowed next");
    }
  });

  it("explains that a final state is final", () => {
    try {
      assertTransition("CANCELLED", "QUEUED");
    } catch (error) {
      expect((error as Error).message).toContain("final state");
    }
  });
});

describe("status machine — invariants", () => {
  it("every status has a label, presentation and transition list", () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_PRESENTATION[status]).toBeTruthy();
      expect(Array.isArray(nextStatuses(status))).toBe(true);
    }
  });

  it("never lists a transition to a status that does not exist", () => {
    for (const status of TRANSACTION_STATUSES) {
      for (const target of nextStatuses(status)) {
        expect(TRANSACTION_STATUSES).toContain(target);
      }
    }
  });

  it("never allows a self-transition", () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(nextStatuses(status)).not.toContain(status);
    }
  });

  it("treats only CANCELLED as terminal", () => {
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("COMPLETED")).toBe(false);
    expect(isTerminal("PAID")).toBe(false);
  });

  it("puts exactly the three floor stages on the queue board", () => {
    expect([...ACTIVE_QUEUE_STATUSES]).toEqual(["QUEUED", "WASHING", "QUALITY_CHECK"]);
  });

  it("communicates status by label as well as colour", () => {
    const labels = TRANSACTION_STATUSES.map(
      (status: TransactionStatusValue) => STATUS_PRESENTATION[status].label,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("isPaid", () => {
  it("is driven by the timestamp, not the status", () => {
    // A vehicle paid upfront is mid-wash but still paid.
    expect(isPaid({ paidAt: new Date() })).toBe(true);
    expect(isPaid({ paidAt: null })).toBe(false);
  });
});
