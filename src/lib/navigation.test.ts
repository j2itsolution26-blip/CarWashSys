import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions/permissions";
import { landingPathFor, safeCallbackPath, visibleNavItems } from "@/lib/navigation";

/**
 * These cover the two pieces of routing the installed app depends on: where the
 * launcher icon lands each role, and what the sign-in screen is willing to
 * redirect to afterwards.
 */

describe("landingPathFor", () => {
  it("sends an owner to the dashboard, not the POS", () => {
    // Regression: owners hold every permission, so taking the first visible nav
    // item put them on /pos — the POS simply sorts first.
    expect(landingPathFor(DEFAULT_ROLE_PERMISSIONS.OWNER)).toBe("/dashboard");
  });

  it("sends an admin to the dashboard", () => {
    expect(landingPathFor(DEFAULT_ROLE_PERMISSIONS.ADMIN)).toBe("/dashboard");
  });

  it("sends a cashier straight to the POS", () => {
    expect(landingPathFor(DEFAULT_ROLE_PERMISSIONS.CASHIER)).toBe("/pos");
  });

  it("sends a washer to the queue", () => {
    expect(landingPathFor(DEFAULT_ROLE_PERMISSIONS.WASHER)).toBe("/queue");
  });

  it("never returns a page the role cannot open", () => {
    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const landing = landingPathFor(permissions);
      const allowed = visibleNavItems(permissions).map((item) => item.href);
      expect(allowed, `${role} landed on ${landing}`).toContain(landing);
    }
  });

  it("falls back to no-access when the user can see nothing", () => {
    expect(landingPathFor([])).toBe("/no-access");
  });
});

describe("safeCallbackPath", () => {
  it("accepts an ordinary same-origin path", () => {
    expect(safeCallbackPath("/pos")).toBe("/pos");
    expect(safeCallbackPath("/transactions?page=2")).toBe("/transactions?page=2");
  });

  it("accepts a URL-encoded path", () => {
    expect(safeCallbackPath("%2Fpos")).toBe("/pos");
  });

  it("accepts a same-host absolute URL, reduced to a path", () => {
    // NextAuth writes the full URL into callbackUrl, not a bare path.
    expect(safeCallbackPath("http://shop.example/pos", "shop.example")).toBe("/pos");
    expect(safeCallbackPath("https://shop.example/transactions?page=2", "shop.example")).toBe(
      "/transactions?page=2",
    );
  });

  it("rejects an absolute URL to another origin", () => {
    expect(safeCallbackPath("https://evil.example/login", "shop.example")).toBeNull();
    expect(safeCallbackPath("http://evil.example", "shop.example")).toBeNull();
    // A lookalike host must not match on prefix.
    expect(safeCallbackPath("https://shop.example.evil.net/pos", "shop.example")).toBeNull();
  });

  it("refuses absolute URLs when the current host is unknown", () => {
    // Without a host to compare against, guessing would defeat the check.
    expect(safeCallbackPath("http://shop.example/pos")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    // `//evil.example` is a valid absolute URL to another host.
    expect(safeCallbackPath("//evil.example")).toBeNull();
    expect(safeCallbackPath("%2F%2Fevil.example")).toBeNull();
  });

  it("rejects backslash-prefixed paths some parsers normalise to //", () => {
    expect(safeCallbackPath("/\\evil.example")).toBeNull();
  });

  it("rejects a redirect back to the login screen", () => {
    expect(safeCallbackPath("/login")).toBeNull();
    expect(safeCallbackPath("/login?callbackUrl=%2Fpos")).toBeNull();
  });

  it("returns null for missing or malformed input", () => {
    expect(safeCallbackPath(undefined)).toBeNull();
    expect(safeCallbackPath(null)).toBeNull();
    expect(safeCallbackPath("")).toBeNull();
    expect(safeCallbackPath("%E0%A4%A")).toBeNull();
  });
});
