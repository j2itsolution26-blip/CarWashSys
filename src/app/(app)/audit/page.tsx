import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/business-date";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { listAuditLogs } from "@/server/services/audit.service";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Groups actions into readable categories for the badge beside each entry. */
function categoryOf(action: string): string {
  if (action.startsWith("PRICE")) return "Pricing";
  if (action.startsWith("PAYMENT")) return "Payment";
  if (action.startsWith("TRANSACTION")) return "Transaction";
  if (action.startsWith("USER") || action.startsWith("ROLE")) return "Staff";
  if (action.startsWith("SERVICE") || action.startsWith("CATEGORY") || action.startsWith("VARIANT"))
    return "Catalog";
  if (action.startsWith("DISCOUNT")) return "Discount";
  return "System";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_READ);

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { entries, total, pageCount } = await listAuditLogs({ page, pageSize: PAGE_SIZE });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Audit log</h1>
        <p className="text-sm text-muted">
          Append-only record of every price change, payment, void and account change. {total} entr
          {total === 1 ? "y" : "ies"}.
        </p>
      </div>

      <Card>
        <CardHeader title="Activity" description={`Page ${page} of ${pageCount}`} />

        {entries.length === 0 ? (
          <EmptyState
            icon="🔒"
            title="Nothing recorded yet"
            description="Entries appear here as soon as staff start using the system."
          />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-strong">{entry.summary}</p>
                  <span className="shrink-0 rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-semibold text-muted">
                    {categoryOf(entry.action)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(entry.createdAt)}
                  {entry.actorName ? ` · ${entry.actorName}` : " · system"}
                  {entry.actorEmail ? ` (${entry.actorEmail})` : ""}
                  {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            {page > 1 ? (
              <Link
                href={`/audit?page=${page - 1}`}
                className="text-xs font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
              >
                ← Newer
              </Link>
            ) : (
              <span className="text-xs text-muted opacity-50">← Newer</span>
            )}
            <span className="text-xs text-muted">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link
                href={`/audit?page=${page + 1}`}
                className="text-xs font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
              >
                Older →
              </Link>
            ) : (
              <span className="text-xs text-muted opacity-50">Older →</span>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
