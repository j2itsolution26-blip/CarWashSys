import { STATUS_PRESENTATION, type TransactionStatusValue } from "@/lib/transactions/status-machine";
import { cn } from "@/lib/utils";

/**
 * Status pill.
 *
 * Colour is reinforced by the written label and a glyph, so the status is
 * readable in greyscale, on a failing counter monitor, and by anyone with
 * colour vision deficiency.
 */

const GLYPHS: Record<string, string> = {
  clock: "◷",
  list: "☰",
  droplets: "≈",
  "search-check": "⌕",
  "circle-check": "✓",
  banknote: "₱",
  "circle-x": "✕",
};

export function StatusBadge({
  status,
  isPaid,
  className,
}: {
  status: TransactionStatusValue;
  /** Shows an extra "Paid" marker when money was taken before the job finished. */
  isPaid?: boolean;
  className?: string;
}) {
  const presentation = STATUS_PRESENTATION[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
          presentation.className,
        )}
      >
        <span aria-hidden="true">{GLYPHS[presentation.icon] ?? "•"}</span>
        {presentation.label}
      </span>
      {isPaid && status !== "PAID" && status !== "CANCELLED" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--positive-soft)] px-2 py-1 text-xs font-semibold text-[var(--text-strong)] ring-1 ring-inset ring-[var(--positive)]">
          <span aria-hidden="true">₱</span>
          Paid
        </span>
      ) : null}
    </span>
  );
}
