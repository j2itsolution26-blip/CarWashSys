/** Route-level loading state. Skeletons, not a spinner, so layout does not jump. */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--surface-inset)]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-inset)]"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-inset)]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
