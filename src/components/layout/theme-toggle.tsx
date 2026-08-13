"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark switch. Persists the choice in localStorage; the inline script in
 * the root layout replays it before first paint.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cg-theme", next ? "dark" : "light");
    } catch {
      // Private browsing with storage disabled — the toggle still works for
      // this session, it just will not be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={mounted ? isDark : undefined}
      className="grid size-10 place-items-center rounded-lg border border-[var(--line)] text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
    >
      <span aria-hidden="true">{mounted && isDark ? "☀" : "☾"}</span>
      <span className="sr-only">{isDark ? "Switch to light theme" : "Switch to dark theme"}</span>
    </button>
  );
}
