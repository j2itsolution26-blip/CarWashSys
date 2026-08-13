import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAnyPermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import { PERMISSIONS, hasPermission } from "@/lib/permissions/permissions";
import { TRANSACTION_STATUSES, STATUS_LABELS } from "@/lib/transactions/status-machine";
import { listTransactions } from "@/server/services/transaction.service";
import type { TransactionStatusValue } from "@/lib/transactions/status-machine";

export const metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const user = await requireAnyPermission([
    PERMISSIONS.TRANSACTION_READ_OWN,
    PERMISSIONS.TRANSACTION_READ_ALL,
  ]);

  const params = await searchParams;
  const status = TRANSACTION_STATUSES.includes(params.status as TransactionStatusValue)
    ? (params.status as TransactionStatusValue)
    : undefined;
  const search = params.search?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, pageCount } = await listTransactions(
    { status, search, page, pageSize: PAGE_SIZE },
    user,
  );

  const seesAll = hasPermission(user.permissions, PERMISSIONS.TRANSACTION_READ_ALL);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Transactions</h1>
        <p className="text-sm text-muted">
          {seesAll ? "All transactions" : "Transactions you created"} · {total} record
          {total === 1 ? "" : "s"}
        </p>
      </div>

      {/* Filters are plain links so the list is shareable, bookmarkable and
          works with the browser's back button. */}
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <FilterLink href="/transactions" label="All" isActive={!status} />
          {TRANSACTION_STATUSES.map((value) => (
            <FilterLink
              key={value}
              href={`/transactions?status=${value}`}
              label={STATUS_LABELS[value]}
              isActive={status === value}
            />
          ))}
        </div>

        <form action="/transactions" className="border-t border-[var(--line)] p-3">
          <label htmlFor="search" className="sr-only">
            Search by transaction or customer number
          </label>
          <div className="flex gap-2">
            <input
              id="search"
              name="search"
              defaultValue={search ?? ""}
              placeholder="Search TXN-000123 or Customer 4"
              className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-contrast)]"
            >
              Search
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Results" description={`Page ${page} of ${pageCount}`} />

        {rows.length === 0 ? (
          <EmptyState
            icon="📄"
            title={search || status ? "No matching transactions" : "No transactions yet"}
            description={
              search || status
                ? "Try a different filter or search term."
                : "Transactions will appear here as soon as the first customer is rung up."
            }
          />
        ) : (
          <>
            {/* Mobile: stacked cards. Desktop: table. Neither ever scrolls
                horizontally. */}
            <ul className="divide-y divide-[var(--line)] lg:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/transactions/${row.id}`}
                    className="block px-4 py-3 hover:bg-[var(--surface-muted)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-strong">{row.customerLabel}</p>
                        <p className="truncate text-xs text-muted">{row.transactionNumber}</p>
                      </div>
                      <span className="tabular font-bold text-strong">{formatPeso(row.total)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} isPaid={row.isPaid} />
                      <span className="text-xs text-muted">{row.vehicleLabel ?? "No vehicle"}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(row.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Transaction</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Customer</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Vehicle</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Cashier</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Created</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--surface-muted)]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/transactions/${row.id}`}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
                        >
                          {row.transactionNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-strong">{row.customerLabel}</td>
                      <td className="px-4 py-3 text-muted">{row.vehicleLabel ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} isPaid={row.isPaid} />
                      </td>
                      <td className="px-4 py-3 text-muted">{row.createdByName}</td>
                      <td className="px-4 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
                      <td className="tabular px-4 py-3 text-right font-bold text-strong">
                        {formatPeso(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
                <PageLink
                  page={page - 1}
                  status={status}
                  search={search}
                  disabled={page <= 1}
                  label="← Previous"
                />
                <span className="text-xs text-muted">
                  Page {page} of {pageCount}
                </span>
                <PageLink
                  page={page + 1}
                  status={status}
                  search={search}
                  disabled={page >= pageCount}
                  label="Next →"
                />
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

function FilterLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={
        isActive
          ? "min-h-9 rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-[var(--brand-contrast)]"
          : "min-h-9 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text-body)] hover:bg-[var(--surface-muted)]"
      }
    >
      {label}
    </Link>
  );
}

function PageLink({
  page,
  status,
  search,
  disabled,
  label,
}: {
  page: number;
  status?: string;
  search?: string;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" className="text-xs font-semibold text-muted opacity-50">
        {label}
      </span>
    );
  }

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  params.set("page", String(page));

  return (
    <Link
      href={`/transactions?${params.toString()}`}
      className="text-xs font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
