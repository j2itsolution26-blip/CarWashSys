import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-4 text-center">
      <div className="space-y-3">
        <p aria-hidden="true" className="text-4xl">
          🔍
        </p>
        <h1 className="text-xl font-semibold">That page could not be found</h1>
        <p className="text-sm text-muted">
          The link may be out of date, or the record may not be one you have access to.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand)] px-5 font-semibold text-[var(--brand-contrast)]"
        >
          Back to work
        </Link>
      </div>
    </main>
  );
}
