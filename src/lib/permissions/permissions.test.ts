import { describe, expect, it } from "vitest";
import {
  canViewTransaction,
  DEFAULT_ROLE_PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  PERMISSION_CATALOG,
  PERMISSIONS,
  ROLE_DEFINITIONS,
} from "./permissions";

const CASHIER = DEFAULT_ROLE_PERMISSIONS.CASHIER;
const WASHER = DEFAULT_ROLE_PERMISSIONS.WASHER;
const OWNER = DEFAULT_ROLE_PERMISSIONS.OWNER;

describe("permission checks", () => {
  it("returns false for a missing or empty permission set", () => {
    expect(hasPermission(undefined, PERMISSIONS.POS_OPERATE)).toBe(false);
    expect(hasPermission(null, PERMISSIONS.POS_OPERATE)).toBe(false);
    expect(hasPermission([], PERMISSIONS.POS_OPERATE)).toBe(false);
  });

  it("hasAnyPermission needs one, hasAllPermissions needs all", () => {
    expect(
      hasAnyPermission(CASHIER, [PERMISSIONS.PRICING_MANAGE, PERMISSIONS.POS_OPERATE]),
    ).toBe(true);
    expect(
      hasAllPermissions(CASHIER, [PERMISSIONS.PRICING_MANAGE, PERMISSIONS.POS_OPERATE]),
    ).toBe(false);
  });
});

describe("role capabilities — the spec's role table", () => {
  it("lets a cashier operate the POS and take payment", () => {
    expect(hasPermission(CASHIER, PERMISSIONS.POS_OPERATE)).toBe(true);
    expect(hasPermission(CASHIER, PERMISSIONS.PAYMENT_CAPTURE)).toBe(true);
  });

  it("does NOT let a cashier change prices", () => {
    expect(hasPermission(CASHIER, PERMISSIONS.PRICING_MANAGE)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.CATALOG_MANAGE)).toBe(false);
  });

  it("does NOT let a cashier void payments, manage staff or read the audit log", () => {
    expect(hasPermission(CASHIER, PERMISSIONS.PAYMENT_VOID)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.PAYMENT_REFUND)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });

  it("does NOT let a cashier read financial reports or every transaction", () => {
    expect(hasPermission(CASHIER, PERMISSIONS.REPORT_READ)).toBe(false);
    expect(hasPermission(CASHIER, PERMISSIONS.TRANSACTION_READ_ALL)).toBe(false);
  });

  it("lets a washer work the queue and nothing else", () => {
    expect(hasPermission(WASHER, PERMISSIONS.QUEUE_READ)).toBe(true);
    expect(hasPermission(WASHER, PERMISSIONS.QUEUE_UPDATE)).toBe(true);
    expect(hasPermission(WASHER, PERMISSIONS.POS_OPERATE)).toBe(false);
    expect(hasPermission(WASHER, PERMISSIONS.PAYMENT_CAPTURE)).toBe(false);
    expect(hasPermission(WASHER, PERMISSIONS.REPORT_READ)).toBe(false);
    expect(hasPermission(WASHER, PERMISSIONS.PRICING_MANAGE)).toBe(false);
  });

  it("gives the owner every permission in the catalog", () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(hasPermission(OWNER, permission.key)).toBe(true);
    }
  });
});

describe("canViewTransaction", () => {
  it("lets read:all see anyone's transaction", () => {
    expect(canViewTransaction([PERMISSIONS.TRANSACTION_READ_ALL], "u1", "u2")).toBe(true);
  });

  it("lets read:own see only their own", () => {
    expect(canViewTransaction([PERMISSIONS.TRANSACTION_READ_OWN], "u1", "u1")).toBe(true);
    expect(canViewTransaction([PERMISSIONS.TRANSACTION_READ_OWN], "u1", "u2")).toBe(false);
  });

  it("denies a user with neither read permission", () => {
    expect(canViewTransaction([PERMISSIONS.QUEUE_READ], "u1", "u1")).toBe(false);
  });
});

describe("catalog integrity", () => {
  it("has no duplicate permission keys", () => {
    const keys = PERMISSION_CATALOG.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only grants roles permissions that exist in the catalog", () => {
    const known = new Set(PERMISSION_CATALOG.map((permission) => permission.key));
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(known.has(permission), `${role} grants unknown ${permission}`).toBe(true);
      }
    }
  });

  it("defines a default permission set for every role", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(DEFAULT_ROLE_PERMISSIONS[role.key]).toBeDefined();
    }
  });
});
