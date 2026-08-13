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

/**
 * Where to send a user immediately after sign-in, and where the installed app
 * lands when launched from its home-screen icon.
 *
 * Ordered by JOB, not by menu position. Taking the first visible nav item would
 * send an owner to the POS — they hold every permission, so the POS is simply
 * first in the list — when the screen they actually open the app for is the
 * dashboard. The order below is therefore explicit:
 *
 *   washer  -> /queue      (queue is all they can reach)
 *   cashier -> /pos        (straight to ringing up a customer)
 *   owner   -> /dashboard  (takings first, POS is one tap away)
 *
 * Each candidate is still checked against the user's real permissions, so this
 * can only ever pick a page they were already allowed to open. It is a
 * convenience layer over `visibleNavItems`, never a grant.
 */
const LANDING_PRIORITY: readonly string[] = ["/dashboard", "/pos", "/queue"];

export function landingPathFor(permissions: readonly string[]): string {
  const allowed = visibleNavItems(permissions);
  const allowedHrefs = new Set(allowed.map((item) => item.href));

  for (const href of LANDING_PRIORITY) {
    if (allowedHrefs.has(href)) return href;
  }

  // Anyone whose role does not include one of the three primary screens falls
  // back to whatever they can see, then to the no-access page.
  return allowed[0]?.href ?? "/no-access";
}

/**
 * Sanitise a `?callbackUrl=` value before redirecting to it.
 *
 * Middleware puts the page the user was trying to reach into the query string so
 * they can be returned there after signing in. That value arrives from the URL
 * bar and is therefore attacker-controlled: a crafted link like
 * `/login?callbackUrl=https://evil.example/login` would otherwise bounce a
 * freshly-authenticated cashier onto a convincing fake login screen.
 *
 * Only same-origin absolute PATHS are allowed through:
 *  * must start with a single "/" — rejects `https://evil.example`
 *  * must not start with "//" — rejects protocol-relative `//evil.example`
 *  * must not start with "/\" — some parsers treat backslash as a slash
 *
 * Returns null when the value is missing or unsafe; callers then fall back to
 * the role-appropriate landing page. Note this permits paths the user may not be
 * allowed to open — that is fine, because the destination enforces its own
 * permissions and will send them to /no-access.
 */
export function safeCallbackPath(
  raw: string | undefined | null,
  currentHost?: string | null,
): string | null {
  if (!raw) return null;

  let value = raw;
  // Middleware URL-encodes the value; decode once so "%2F%2Fevil" is inspected
  // as "//evil" rather than sneaking past the checks below.
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }

  value = value.trim();

  /*
   * NextAuth writes an ABSOLUTE url ("http://host/pos"), not a path. Accept it
   * only when the host matches the host serving this request, then reduce it to
   * a path — so an attacker-supplied "https://evil.example/pos" is rejected
   * while a genuine same-site redirect still works. `currentHost` comes from the
   * Host header of the live request; when it is unavailable, absolute URLs are
   * refused outright rather than guessed at.
   */
  if (/^https?:\/\//i.test(value)) {
    if (!currentHost) return null;
    try {
      const parsed = new URL(value);
      if (parsed.host !== currentHost) return null;
      value = `${parsed.pathname}${parsed.search}`;
    } catch {
      return null;
    }
  }
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Never bounce straight back to the sign-in screen — that loops.
  if (value === "/login" || value.startsWith("/login?")) return null;

  return value;
}
