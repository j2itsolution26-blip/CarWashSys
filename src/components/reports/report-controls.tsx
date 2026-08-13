"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Date range controls.
 *
 * The range lives in the URL, so a report is linkable, back/forward works, and
 * the server component re-runs with the new range — no client-side refetch layer
 * and no duplicate data-fetching stack. Quick ranges are plain links for the
 * same reason: they are navigations, not state.
 */

export interface QuickRange {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function ReportControls({
  from,
  to,
  today,
  quickRanges,
  activeRange,
}: {
  from: string;
  to: string;
  today: string;
  quickRanges: QuickRange[];
  activeRange: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /** CSV of the current range, built from the same URL the page was rendered with. */
  const exportHref = `/reports/export?${new URLSearchParams({ from, to }).toString()}`;

  const applyRange = useCallback(
    (next: QuickRange) => {
      const search = new URLSearchParams(params.toString());
      search.set("from", next.from);
      search.set("to", next.to);
      router.push(`${pathname}?${search.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="space-y-3">
      {/* Quick ranges — one row above the charts, as the filter convention. */}
      <div className="no-print flex flex-wrap gap-1.5">
        {quickRanges.map((range) => (
          <button
            key={range.key}
            type="button"
            onClick={() => applyRange(range)}
            aria-pressed={activeRange === range.key}
            className={cn(
              "min-h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
              activeRange === range.key
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                : "border-[var(--line-strong)] text-[var(--text-body)] hover:bg-[var(--surface-muted)]",
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      <form action="/reports" className="no-print flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            max={today}
            className="h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] px-3 text-sm text-strong"
          />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            max={today}
            className="h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] px-3 text-sm text-strong"
          />
        </div>

        <Button type="submit" size="sm">
          Run report
        </Button>

        <div className="ml-auto flex gap-2">
          {/* A real file built server-side from the same query, not a
              client-side dump of whatever happens to be in the DOM. */}
          <Link
            href={exportHref}
            prefetch={false}
            className="inline-flex min-h-9 items-center rounded-lg border border-[var(--line-strong)] px-3 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
          >
            Export CSV
          </Link>
          {/* PDF via the print pipeline: the app already has print styles, and
              this produces a correct document on every platform without adding
              a PDF renderer to the bundle. */}
          <PrintButton />
        </div>
      </form>
    </div>
  );
}

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-9 items-center rounded-lg border border-[var(--line-strong)] px-3 text-sm font-medium text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
    >
      Export PDF
    </button>
  );
}
