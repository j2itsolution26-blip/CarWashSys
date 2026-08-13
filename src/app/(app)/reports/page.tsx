import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requirePermission } from "@/lib/auth/guards";
import { businessDateKey } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import { describeMethod } from "@/lib/payment-methods";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { getSalesReport } from "@/server/services/report.service";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission(PERMISSIONS.REPORT_READ);

  const params = await searchParams;
  const today = businessDateKey();
  const defaultFrom = businessDateKey(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  const from = DATE_PATTERN.test(params.from ?? "") ? params.from! : defaultFrom;
  const to = DATE_PATTERN.test(params.to ?? "") ? params.to! : today;

  const report = await getSalesReport(from, to);
  const hasData = report.transactionCount > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Sales reports</h1>
        <p className="text-sm text-muted">
          Revenue is the sum of captured payments; cancelled transactions are excluded from service
          totals.
        </p>
      </div>

      <Card>
        <form action="/reports" className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="from" className="mb-1 block text-sm font-medium text-strong">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              max={today}
              className="h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-sm font-medium text-strong">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              max={today}
              className="h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-contrast)]"
          >
            Run report
          </button>
        </form>
      </Card>

      {!hasData ? (
        <Card>
          <EmptyState
            icon="📈"
            title="No transactions in this period"
            description={`Nothing was recorded between ${from} and ${to}.`}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Revenue" value={formatPeso(report.totalRevenue)} />
            <Metric label="Transactions" value={String(report.transactionCount)} />
            <Metric label="Paid" value={String(report.paidCount)} />
            <Metric label="Average ticket" value={formatPeso(report.averageTicket)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="By payment method"
              columns={["Method", "Count", "Amount"]}
              rows={report.byMethod.map((row) => [
                describeMethod(row.method),
                String(row.count),
                formatPeso(row.amount),
              ])}
            />
            <ReportTable
              title="By service"
              columns={["Service", "Qty", "Revenue"]}
              rows={report.byService.map((row) => [
                row.serviceName,
                String(row.quantity),
                formatPeso(row.revenue),
              ])}
            />
            <ReportTable
              title="By vehicle"
              columns={["Vehicle", "Count", "Revenue"]}
              rows={report.byVehicle.map((row) => [
                row.vehicle,
                String(row.count),
                formatPeso(row.revenue),
              ])}
            />
            <ReportTable
              title="By cashier"
              columns={["Cashier", "Count", "Revenue"]}
              rows={report.byCashier.map((row) => [
                row.name,
                String(row.count),
                formatPeso(row.revenue),
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="tabular mt-1 text-2xl font-bold text-strong">{value}</p>
      </CardBody>
    </Card>
  );
}

function ReportTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No data.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-muted">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={index === 0 ? "px-4 py-2.5 font-semibold" : "px-4 py-2.5 text-right font-semibold"}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={
                      index === 0
                        ? "px-4 py-2.5 font-medium text-strong"
                        : "tabular px-4 py-2.5 text-right text-[var(--text-body)]"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
