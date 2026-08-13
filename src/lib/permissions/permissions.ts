/**
 * Permission vocabulary and the default role → permission mapping.
 *
 * Authorisation is checked against PERMISSION KEYS, never against role names.
 * That means the owner can later create a "Senior Cashier" role that may void
 * payments without a single code change, and it keeps every guard in the
 * codebase reading as a capability ("may this user capture a payment?") rather
 * than an identity ("is this user a cashier?").
 *
 * Pure module — imported by both server guards and client components.
 */

export const PERMISSIONS = {
  // POS
  POS_OPERATE: "pos:operate",

  // Transactions
  TRANSACTION_READ_OWN: "transaction:read:own",
  TRANSACTION_READ_ALL: "transaction:read:all",
  TRANSACTION_CANCEL: "transaction:cancel",
  TRANSACTION_VOID: "transaction:void",

  // Payments
  PAYMENT_CAPTURE: "payment:capture",
  PAYMENT_VOID: "payment:void",
  PAYMENT_REFUND: "payment:refund",

  // Discounts
  DISCOUNT_APPLY: "discount:apply",
  DISCOUNT_MANAGE: "discount:manage",

  // Wash floor
  QUEUE_READ: "queue:read",
  QUEUE_UPDATE: "queue:update",

  // Catalog & pricing
  CATALOG_READ: "catalog:read",
  CATALOG_MANAGE: "catalog:manage",
  PRICING_MANAGE: "pricing:manage",

  // Administration
  USER_MANAGE: "user:manage",
  REPORT_READ: "report:read",
  AUDIT_READ: "audit:read",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{
  key: PermissionKey;
  category: string;
  description: string;
}> = [
  { key: PERMISSIONS.POS_OPERATE, category: "POS", description: "Create transactions and operate the point of sale" },
  { key: PERMISSIONS.TRANSACTION_READ_OWN, category: "Transactions", description: "View transactions they created" },
  { key: PERMISSIONS.TRANSACTION_READ_ALL, category: "Transactions", description: "View all transactions" },
  { key: PERMISSIONS.TRANSACTION_CANCEL, category: "Transactions", description: "Cancel an unpaid transaction" },
  { key: PERMISSIONS.TRANSACTION_VOID, category: "Transactions", description: "Void a paid transaction" },
  { key: PERMISSIONS.PAYMENT_CAPTURE, category: "Payments", description: "Accept payment and issue receipts" },
  { key: PERMISSIONS.PAYMENT_VOID, category: "Payments", description: "Void a captured payment" },
  { key: PERMISSIONS.PAYMENT_REFUND, category: "Payments", description: "Refund a captured payment" },
  { key: PERMISSIONS.DISCOUNT_APPLY, category: "Discounts", description: "Apply an existing discount to a sale" },
  { key: PERMISSIONS.DISCOUNT_MANAGE, category: "Discounts", description: "Create and edit discounts" },
  { key: PERMISSIONS.QUEUE_READ, category: "Wash floor", description: "View the wash queue" },
  { key: PERMISSIONS.QUEUE_UPDATE, category: "Wash floor", description: "Advance wash status" },
  { key: PERMISSIONS.CATALOG_READ, category: "Catalog", description: "View vehicles, services and prices" },
  { key: PERMISSIONS.CATALOG_MANAGE, category: "Catalog", description: "Create and edit vehicles and services" },
  { key: PERMISSIONS.PRICING_MANAGE, category: "Catalog", description: "Change service prices" },
  { key: PERMISSIONS.USER_MANAGE, category: "Administration", description: "Manage staff accounts and roles" },
  { key: PERMISSIONS.REPORT_READ, category: "Administration", description: "View sales reports" },
  { key: PERMISSIONS.AUDIT_READ, category: "Administration", description: "View the audit log" },
  { key: PERMISSIONS.SETTINGS_MANAGE, category: "Administration", description: "Change system settings" },
];

export const ROLE_KEYS = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  CASHIER: "CASHIER",
  WASHER: "WASHER",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((p) => p.key);

/**
 * Seeded defaults. The owner can re-map these at runtime; this is the starting
 * point, not a hardcoded policy.
 *
 * OWNER and ADMIN share the same capability set — they differ in protection,
 * not in power: the seeded owner account cannot be deactivated or stripped of
 * its role, so the shop can never lock itself out.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  CASHIER: [
    PERMISSIONS.POS_OPERATE,
    PERMISSIONS.TRANSACTION_READ_OWN,
    PERMISSIONS.PAYMENT_CAPTURE,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.QUEUE_READ,
    PERMISSIONS.QUEUE_UPDATE,
    PERMISSIONS.CATALOG_READ,
  ],
  WASHER: [PERMISSIONS.QUEUE_READ, PERMISSIONS.QUEUE_UPDATE],
};

export const ROLE_DEFINITIONS: ReadonlyArray<{
  key: RoleKey;
  name: string;
  description: string;
  sortOrder: number;
}> = [
  { key: ROLE_KEYS.OWNER, name: "Owner", description: "Full control of the business and system", sortOrder: 1 },
  { key: ROLE_KEYS.ADMIN, name: "Administrator", description: "Manages pricing, staff and reports", sortOrder: 2 },
  { key: ROLE_KEYS.CASHIER, name: "Cashier", description: "Operates the POS and accepts payment", sortOrder: 3 },
  { key: ROLE_KEYS.WASHER, name: "Washing Staff", description: "Works the queue and updates wash status", sortOrder: 4 },
];

export function hasPermission(
  granted: readonly string[] | undefined | null,
  required: PermissionKey,
): boolean {
  return Boolean(granted?.includes(required));
}

export function hasAnyPermission(
  granted: readonly string[] | undefined | null,
  required: readonly PermissionKey[],
): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}

export function hasAllPermissions(
  granted: readonly string[] | undefined | null,
  required: readonly PermissionKey[],
): boolean {
  return required.every((permission) => hasPermission(granted, permission));
}

/**
 * Can this user see this transaction? `read:all` sees everything; `read:own`
 * sees only what they rang up. Used by both the list query and the detail page.
 */
export function canViewTransaction(
  granted: readonly string[] | undefined | null,
  viewerId: string,
  transactionCreatedById: string,
): boolean {
  if (hasPermission(granted, PERMISSIONS.TRANSACTION_READ_ALL)) return true;
  return (
    hasPermission(granted, PERMISSIONS.TRANSACTION_READ_OWN) && viewerId === transactionCreatedById
  );
}
