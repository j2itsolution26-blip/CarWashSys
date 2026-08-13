"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/server/actions/auth.actions";
import { initialsOf, cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";
import { ThemeToggle } from "./theme-toggle";

/**
 * Application chrome.
 *
 * Desktop: persistent sidebar. Tablet/mobile: the sidebar collapses into a
 * drawer and the primary destinations also appear as a bottom bar, because a
 * cashier holding a tablet one-handed cannot reach a top-left hamburger.
 */
export function AppShell({
  user,
  navItems,
  businessName,
  children,
}: {
  user: { name: string; email: string; roles: string[] };
  navItems: NavItem[];
  businessName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever navigation happens.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const groups = ["Operations", "Administration"] as const;
  const bottomBarItems = navItems.slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ---------------------------------------------------------------- */}
      {/* Sidebar (desktop) / drawer (small screens)                        */}
      {/* ---------------------------------------------------------------- */}
      {drawerOpen ? (
        <div
          className="no-print fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[var(--line)] bg-[var(--surface-card)] transition-transform duration-150 lg:static lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--line)] px-4">
          <span aria-hidden="true" className="text-2xl">
            🚿
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold uppercase tracking-wide text-strong">
              {businessName}
            </p>
            <p className="text-xs text-muted">Point of Sale</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => {
            const items = navItems.filter((item) => item.group === group);
            if (items.length === 0) return null;

            return (
              <div key={group} className="mb-5">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {group}
                </p>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                              : "text-[var(--text-body)] hover:bg-[var(--surface-muted)]",
                          )}
                        >
                          <span aria-hidden="true" className="text-base">
                            {item.glyph}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {isActive ? (
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full bg-[var(--brand)]"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand-strong)]"
            >
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-strong">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.roles.join(", ") || "No role"}</p>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
            >
              <span aria-hidden="true">⏻</span>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Main column                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-card)]/95 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="grid size-10 place-items-center rounded-lg border border-[var(--line)] lg:hidden"
          >
            <span aria-hidden="true">☰</span>
          </button>

          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-strong lg:text-base">
            {navItems.find((item) => pathname.startsWith(item.href))?.description ??
              "Point of Sale"}
          </p>

          <ThemeToggle />
        </header>

        <main
          id="main-content"
          className="min-h-0 flex-1 px-4 pb-24 pt-4 lg:px-6 lg:pb-8 lg:pt-6"
        >
          {children}
        </main>

        {/* Thumb-reachable primary nav on phones and tablets. */}
        <nav
          aria-label="Primary"
          className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-flow-col border-t border-[var(--line)] bg-[var(--surface-card)] lg:hidden"
        >
          {bottomBarItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-15 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium",
                  isActive ? "text-[var(--brand-strong)]" : "text-[var(--text-muted)]",
                )}
              >
                <span aria-hidden="true" className="text-lg">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
