import { PERMISSIONS, hasAnyPermission, type PermissionKey } from "@/lib/permissions/permissions";

/**
 * Application navigation.
 *
 * Each destination declares the permission(s) that make it reachable. The same
 * list drives the sidebar AND the post-login landing page, so a washer who can
 * only see the queue is sent straight to the queue instead of an empty
 * dashboard they have no rights to read.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Single glyph — avoids shipping an icon font for eight links. */
  glyph: string;
  description: string;
  /** Visible if the user holds ANY of these. Empty = any signed-in user. */
  permissions: PermissionKey[];
  group: "Operations" | "Administration";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/pos",
    label: "POS",
    glyph: "🧾",
    description: "Ring up a customer",
    permissions: [PERMISSIONS.POS_OPERATE],
    group: "Operations",
  },
  {
    href: "/queue",
    label: "Queue",
    glyph: "🚿",
    description: "Vehicles being washed",
    permissions: [PERMISSIONS.QUEUE_READ],
    group: "Operations",
  },
  {
    href: "/transactions",
    label: "Transactions",
    glyph: "📄",
    description: "Sales history and receipts",
    permissions: [PERMISSIONS.TRANSACTION_READ_OWN, PERMISSIONS.TRANSACTION_READ_ALL],
    group: "Operations",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    glyph: "📊",
    description: "Today at a glance",
    permissions: [PERMISSIONS.REPORT_READ],
    group: "Administration",
  },
  {
    href: "/reports",
    label: "Reports",
    glyph: "📈",
    description: "Sales over a date range",
    permissions: [PERMISSIONS.REPORT_READ],
    group: "Administration",
  },
  {
    href: "/pricing",
    label: "Pricing",
    glyph: "💰",
    description: "Vehicle and service prices",
    permissions: [PERMISSIONS.PRICING_MANAGE],
    group: "Administration",
  },
  {
    href: "/services",
    label: "Services & Vehicles",
    glyph: "🧰",
    description: "Catalog management",
    permissions: [PERMISSIONS.CATALOG_MANAGE],
    group: "Administration",
  },
  {
    href: "/users",
    label: "Staff",
    glyph: "👥",
    description: "Accounts and roles",
    permissions: [PERMISSIONS.USER_MANAGE],
    group: "Administration",
  },
  {
    href: "/audit",
    label: "Audit Log",
    glyph: "🔒",
    description: "Who changed what",
    permissions: [PERMISSIONS.AUDIT_READ],
    group: "Administration",
  },
];

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.permissions.length === 0 || hasAnyPermission(permissions, item.permissions),
  );
}

/** Where to send a user immediately after sign-in. */
export function landingPathFor(permissions: readonly string[]): string {
  const items = visibleNavItems(permissions);
  return items[0]?.href ?? "/no-access";
}
