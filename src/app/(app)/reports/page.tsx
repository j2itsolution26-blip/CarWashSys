import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ChartPalette, DonutChart, RankingChart, TrendChart } from "@/components/reports/charts";
import { ReportControls, type QuickRange } from "@/components/reports/report-controls";
import { getSessionUser, requirePermission } from "@/lib/auth/guards";
import { businessDateKey, formatDateOnly } from "@/lib/business-date";
import { formatPeso } from "@/lib/money";
import { describeMethod } from "@/lib/payment-methods";
import { PERMISSIONS, hasPermission } from "@/lib/permissions/permissions";
import { initialsOf } from "@/lib/utils";
import { getSalesReport } from "@/server/services/report.service";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Sales & business statistics.
 *
 * A SERVER component: every figure is aggregated in one `getSalesReport` call
 * (four parallel statements) and rendered on the server. Only the charts and the
 * range picker are client components, because only they need hover state and
 * navigation. Adding a chart therefore costs no extra database round trip.
 *
 * Every number on this page is derived from real transactions, payments and
 * items. There are no sample series and no placeholder percentages — when the
 * range is empty the page says so instead of drawing a flat zero chart.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission(PERMISSIONS.REPORT_READ);
  const user = await getSessionUser();

  // Cashier performance names individual staff, so it is gated separately from
  // the rest of the report rather than shown to anyone who can read revenue.
  const canSeeStaff = hasPermission(user?.permissions, PERMISSIONS.USER_MANAGE);

  const params = await searchParams;
  const today = businessDateKey();
  const defaultFrom = businessDateKey(new Date(Date.now() - 29 * DAY));

  const from = DATE_PATTERN.test(params.from ?? "") ? params.from! : defaultFrom;
  const to = DATE_PATTERN.test(params.to ?? "") ? params.to! : today;

  const report = await getSalesReport(from, to);
  const hasData = report.transactionCount > 0;

  const quickRanges = buildQuickRanges();
  const activeRange =
    quickRanges.find((range) => range.from === from && range.to === to)?.key ?? null;

  return (
    <div className="space-y-4">
      <ChartPalette />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Sales reports</h1>
          <p className="text-sm text-muted">
            Overview of your sales performance and transactions.
          </p>
        </div>
        <p className="text-xs text-muted">
          {formatDateOnly(`${from}T00:00:00.000Z`)} — {formatDateOnly(`${to}T00:00:00.000Z`)}
        </p>
      </div>

      <Card>
        <CardBody>
          <ReportControls
            from={from}
            to={to}
            today={today}
            quickRanges={quickRanges}
            activeRange={activeRange}
          />
        </CardBody>
      </Card>

      {!hasData ? (
        <Card>
          <EmptyState
            icon="📈"
            title="No sales data available for this period"
            description={`Nothing was recorded between ${from} and ${to}. Try a wider date range.`}
          />
        </Card>
      ) : (
        <>
          {/* ROW 1 — KPIs -------------------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Kpi
              icon="₱"
              label="Total revenue"
              value={formatPeso(report.totalRevenue)}
              current={Number(report.totalRevenue)}
              previous={Number(report.previous.totalRevenue)}
            />
            <Kpi
              icon="🧾"
              label="Transactions"
              value={String(report.transactionCount)}
              current={report.transactionCount}
              previous={report.previous.transactionCount}
            />
            <Kpi
              icon="✓"
              label="Paid"
              value={String(report.paidCount)}
              current={report.paidCount}
              previous={report.previous.paidCount}
            />
            <Kpi
              icon="✕"
              label="Cancelled"
              value={String(report.cancelledCount)}
              current={report.cancelledCount}
              previous={report.previous.cancelledCount}
              // More cancellations is bad news, so the arrow's colour flips.
              invertTrend
              footnote={`${report.cancellation.rate}% of transactions`}
            />
            <Kpi
              icon="⌀"
              label="Average ticket"
              value={formatPeso(report.averageTicket)}
              current={Number(report.averageTicket)}
              previous={Number(report.previous.averageTicket)}
            />
            <Kpi
              icon="🚗"
              label="Vehicles served"
              value={String(report.vehiclesServed)}
              current={report.vehiclesServed}
              previous={report.previous.vehiclesServed}
            />
          </div>

          {/* ROW 2 — payment mix, service mix, trend ----------------------- */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Revenue by payment method" />
              <CardBody>
                <DonutChart
                  slices={report.byMethod.map((row) => ({
                    label: describeMethod(row.method),
                    value: Number(row.amount),
                    count: row.count,
                  }))}
                  centerLabel="Total"
                  centerValue={formatPeso(report.totalRevenue)}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue by service" />
              <CardBody>
                <DonutChart
                  slices={foldOther(
                    report.byService.map((row) => ({
                      label: row.serviceName,
                      value: Number(row.revenue),
                      count: row.quantity,
                    })),
                  )}
                  centerLabel="Total"
                  centerValue={formatPeso(
                    report.byService
                      .reduce((sum, row) => sum + Number(row.revenue), 0)
                      .toFixed(2),
                  )}
                  countLabel="qty"
                />
              </CardBody>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader title="Revenue trend" />
              <CardBody>
                <TrendChart points={report.trend} />
              </CardBody>
            </Card>
          </div>

          {/* ROW 3 — hours, vehicles, top services ------------------------- */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader
                title="Transactions by hour"
                action={
                  report.peakBand ? (
                    <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand-strong)]">
                      Peak {report.peakBand.band} · {report.peakBand.share}%
                    </span>
                  ) : undefined
                }
              />
              <CardBody>
                <DonutChart
                  slices={report.byHourBand
                    .filter((row) => row.count > 0)
                    .map((row) => ({ label: row.band, value: row.count }))}
                  centerLabel="Transactions"
                  centerValue={String(report.transactionCount)}
                  valueFormat="plain"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue by vehicle type" />
              <CardBody>
                <DonutChart
                  slices={foldOther(
                    report.byVehicle.map((row) => ({
                      label: row.vehicle,
                      value: Number(row.revenue),
                      count: row.count,
                    })),
                  )}
                  centerLabel="Total"
                  centerValue={formatPeso(
                    report.byVehicle.reduce((sum, row) => sum + Number(row.revenue), 0).toFixed(2),
                  )}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Top services" />
              <CardBody>
                <RankingChart
                  rows={report.byService.slice(0, 6).map((row) => ({
                    label: row.serviceName,
                    value: Number(row.revenue),
                    meta: `(${row.quantity})`,
                  }))}
                />
              </CardBody>
            </Card>
          </div>

          {/* ROW 4 — cashiers, insights, cancellations --------------------- */}
          <div className="grid gap-4 xl:grid-cols-3">
            {canSeeStaff ? (
              <Card>
                <CardHeader title="Top cashiers" />
                {report.cashierPerformance.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted">No cashier activity.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-muted">
                          <th scope="col" className="px-4 py-2.5 font-semibold">Cashier</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Txn</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Avg</th>
                          <th scope="col" className="px-4 py-2.5 text-right font-semibold">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {report.cashierPerformance.map((row) => (
                          <tr key={row.name}>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[0.65rem] font-bold text-[var(--brand-strong)]"
                                >
                                  {initialsOf(row.name)}
                                </span>
                                <span className="min-w-0 truncate font-medium text-strong">
                                  {row.name}
                                </span>
                              </span>
                            </td>
                            <td className="tabular px-3 py-2.5 text-right">{row.transactions}</td>
                            <td className="tabular px-3 py-2.5 text-right font-semibold text-strong">
                              {formatPeso(row.revenue)}
                            </td>
                            <td className="tabular px-3 py-2.5 text-right">
                              {formatPeso(row.averageTicket)}
                            </td>
                            <td className="tabular px-4 py-2.5 text-right">{row.performance}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Business insights" />
              <CardBody className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Insight label="Best service" value={report.byService[0]?.serviceName ?? "—"} />
                <Insight label="Best vehicle type" value={report.byVehicle[0]?.vehicle ?? "—"} />
                <Insight label="Peak period" value={report.peakBand?.band ?? "—"} />
                {canSeeStaff ? (
                  <Insight label="Top cashier" value={report.cashierPerformance[0]?.name ?? "—"} />
                ) : null}
                <Insight label="Average transaction" value={formatPeso(report.averageTicket)} />
                <Insight label="Cancellation rate" value={`${report.cancellation.rate}%`} />
                <Insight
                  label="Highest revenue day"
                  value={
                    report.bestDay
                      ? formatDateOnly(`${report.bestDay.date}T00:00:00.000Z`)
                      : "—"
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Cancellation statistics" />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Total cancelled" value={String(report.cancellation.count)} />
                  <Stat label="Cancelled value" value={formatPeso(report.cancellation.amount)} />
                  <Stat label="Cancellation rate" value={`${report.cancellation.rate}%`} />
                  {canSeeStaff ? (
                    <Stat
                      label="Most cancellations"
                      value={
                        report.cancellation.topCashier
                          ? `${report.cancellation.topCashier.name} (${report.cancellation.topCashier.count})`
                          : "—"
                      }
                    />
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  Cancellation reasons are recorded per transaction — open the{" "}
                  <Link href="/audit" className="font-medium text-[var(--brand-strong)] underline underline-offset-2">
                    audit log
                  </Link>{" "}
                  to see who cancelled what and why.
                </p>
              </CardBody>
            </Card>
          </div>

          {/* ROW 5 — detail --------------------------------------------- */}
          <Card>
            <CardHeader
              title="Recent transactions"
              action={
                <Link
                  href={`/transactions?from=${from}&to=${to}`}
                  className="text-sm font-semibold text-[var(--brand-strong)] underline underline-offset-2"
                >
                  Open full list
                </Link>
              }
            />
            <CardBody>
              <p className="text-sm text-muted">
                The transactions screen already provides search, status and payment filters,
                sorting and pagination over the same records. It is linked here rather than
                duplicated so there is one implementation to keep correct.
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Fold everything past the 5th slot into "Other" — the ramp is not cycled. */
function foldOther(
  rows: Array<{ label: string; value: number; count?: number }>,
): Array<{ label: string; value: number; count?: number }> {
  if (rows.length <= 5) return rows;
  const head = rows.slice(0, 4);
  const tail = rows.slice(4);
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, row) => sum + row.value, 0),
      count: tail.reduce((sum, row) => sum + (row.count ?? 0), 0),
    },
  ];
}

function buildQuickRanges(): QuickRange[] {
  const now = new Date();
  const key = (date: Date) => businessDateKey(date);
  const todayKey = key(now);

  const startOfWeek = new Date(now);
  // Monday-first, matching how a shop thinks about a trading week.
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const yesterday = new Date(now.getTime() - DAY);

  return [
    { key: "today", label: "Today", from: todayKey, to: todayKey },
    { key: "yesterday", label: "Yesterday", from: key(yesterday), to: key(yesterday) },
    { key: "week", label: "This week", from: key(startOfWeek), to: todayKey },
    { key: "month", label: "This month", from: key(startOfMonth), to: todayKey },
    {
      key: "last-month",
      label: "Last month",
      from: key(startOfLastMonth),
      to: key(endOfLastMonth),
    },
    { key: "year", label: "This year", from: key(startOfYear), to: todayKey },
  ];
}

function Kpi({
  icon,
  label,
  value,
  current,
  previous,
  invertTrend = false,
  footnote,
}: {
  icon: string;
  label: string;
  value: string;
  current: number;
  previous: number;
  invertTrend?: boolean;
  footnote?: string;
}) {
  /*
   * Percentage change against the previous equal-length period. Growth from
   * zero has no meaningful percentage — reporting "+100%" or "+∞%" would be
   * inventing a number — so it is shown as "new" instead.
   */
  const delta =
    previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100;

  const direction =
    delta === null ? "new" : Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
  const good = invertTrend ? direction === "down" : direction === "up";

  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-base font-bold text-[var(--brand-strong)]"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="tabular mt-0.5 truncate text-2xl font-bold text-strong">{value}</p>
          <p className="mt-1 flex items-center gap-1 text-xs">
            {direction === "new" ? (
              <span className="font-medium text-muted">New this period</span>
            ) : direction === "flat" ? (
              <span className="font-medium text-muted">→ No change</span>
            ) : (
              <span
                className="font-semibold"
                style={{ color: good ? "var(--positive)" : "var(--danger)" }}
              >
                {direction === "up" ? "↑" : "↓"} {Math.abs(delta!).toFixed(1)}%
              </span>
            )}
            <span className="truncate text-muted">
              {footnote ?? "vs previous period"}
            </span>
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="truncate text-sm font-semibold text-strong">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabular truncate text-sm font-bold text-strong">{value}</p>
    </div>
  );
}
