import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateOnly } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import { describeMethod } from "@/lib/payment-methods";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { getDashboardMetrics } from "@/server/services/report.service";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Today at a glance.
 *
 * Every figure is an aggregate of real rows. Before the first sale of the day
 * these are genuine zeros with an empty state — no sample data, no invented
 * trend percentages.
 */
export default async function DashboardPage() {
  await requirePermission(PERMISSIONS.REPORT_READ);
  const metrics = await getDashboardMetrics();

  const peakRevenue = Math.max(
    ...metrics.lastSevenDays.map((day) => Number(day.revenue)),
    1,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">{formatDateOnly(`${metrics.businessDate}T00:00:00Z`)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue today" value={formatPeso(metrics.revenueToday)} emphasis />
        <Metric label="Transactions today" value={String(metrics.transactionsToday)} />
        <Metric label="Average ticket" value={formatPeso(metrics.averageTicketToday)} />
        <Metric label="In the queue" value={String(metrics.inQueueCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Today's activity" />
          <CardBody className="space-y-2">
            <Line label="Paid" value={String(metrics.paidTransactionsToday)} />
            <Line label="Completed" value={String(metrics.completedToday)} />
            <Line label="Awaiting payment" value={String(metrics.pendingCount)} />
            <Line label="Cancelled" value={String(metrics.cancelledToday)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payments by method" description="Today, captured payments only" />
          {metrics.revenueByMethodToday.length === 0 ? (
            <EmptyState icon="₱" title="No payments today" />
          ) : (
            <CardBody className="space-y-2">
              {metrics.revenueByMethodToday.map((row) => (
                <Line
                  key={row.method}
                  label={`${describeMethod(row.method)} (${row.count})`}
                  value={formatPeso(row.amount)}
                />
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Top services today" />
          {metrics.topServicesToday.length === 0 ? (
            <EmptyState
              icon="🧰"
              title="No services sold yet today"
              description="Ring up the first customer to see this fill in."
            />
          ) : (
            <CardBody className="space-y-2">
              {metrics.topServicesToday.map((row) => (
                <Line
                  key={row.serviceName}
                  label={`${row.serviceName} × ${row.quantity}`}
                  value={formatPeso(row.revenue)}
                />
              ))}
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Last 7 days" description="Revenue from captured payments" />
          <CardBody>
            <ul className="space-y-2">
              {metrics.lastSevenDays.map((day) => {
                const width = (Number(day.revenue) / peakRevenue) * 100;
                return (
                  <li key={day.date} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-muted">{day.date.slice(5)}</span>
                    <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                      {/* Bar is decorative; the figure beside it is the data. */}
                      <span
                        aria-hidden="true"
                        className="block h-full rounded-full bg-[var(--brand)]"
                        style={{ width: `${Math.max(width, Number(day.revenue) > 0 ? 4 : 0)}%` }}
                      />
                    </span>
                    <span className="tabular w-24 shrink-0 text-right text-xs font-semibold text-strong">
                      {formatPeso(day.revenue)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/pos"
          className="font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
        >
          Open the POS →
        </Link>
        <Link
          href="/reports"
          className="font-semibold text-[var(--brand-strong)] underline-offset-2 hover:underline"
        >
          Full reports →
        </Link>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p
          className={
            emphasis
              ? "tabular mt-1 text-3xl font-bold text-strong"
              : "tabular mt-1 text-2xl font-bold text-strong"
          }
        >
          {value}
        </p>
      </CardBody>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-[var(--text-body)]">{label}</span>
      <span className="tabular shrink-0 font-semibold text-strong">{value}</span>
    </div>
  );
}
