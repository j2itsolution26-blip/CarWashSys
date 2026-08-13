import "server-only";
import { prisma } from "@/lib/db";
import {
  businessDate,
  businessDateKey,
  businessDayRange,
  getBusinessTimezone,
} from "@/lib/business-date";
import { toAmountString } from "@/lib/money";
import { ACTIVE_QUEUE_STATUSES } from "@/lib/transactions/status-machine";
import type { TransactionStatus } from "@prisma/client";
import { buildVehicleLabel } from "./transaction.service";

/**
 * Reporting reads.
 *
 * Every number here is an aggregate over real rows. There are no placeholder
 * figures, no seeded sample sales and no "+12% vs last week" unless it was
 * actually computed from data. When the shop has not opened yet, these return
 * zeros and the UI renders an empty state — a dashboard that invents numbers is
 * worse than one that admits it has none.
 */

export interface DashboardMetrics {
  businessDate: string;
  transactionsToday: number;
  paidTransactionsToday: number;
  revenueToday: string;
  averageTicketToday: string;
  pendingCount: number;
  inQueueCount: number;
  completedToday: number;
  cancelledToday: number;
  topServicesToday: Array<{ serviceName: string; quantity: number; revenue: string }>;
  revenueByMethodToday: Array<{ method: string; amount: string; count: number }>;
  lastSevenDays: Array<{ date: string; revenue: string; transactions: number }>;
}

/**
 * PERFORMANCE NOTE
 *
 * This used to issue 23 statements — 9 in parallel, then `getLastSevenDays`
 * looping 7 times with 2 awaited queries per iteration, strictly sequentially.
 * Against a database one WAN hop away (~48ms round trip) that cost ~1000ms
 * before a single pixel rendered, most of it spent waiting rather than
 * computing.
 *
 * It is now 6 statements, all issued in parallel, by:
 *   * folding the four "today" counts into one aggregate with FILTER clauses,
 *   * deriving pending/in-queue from a single groupBy over status,
 *   * deriving the day's revenue by summing the by-method groups rather than
 *     asking for the same total twice,
 *   * replacing the seven-day loop with two windowed queries.
 *
 * The arithmetic is unchanged: same filters, same date ranges, same rounding.
 */
export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
  const today = businessDate(now);
  const { start, end } = businessDayRange(now);

  // Business days covered by the sparkline, oldest first.
  const sevenDays = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(now.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
    return { key: businessDate(at), range: businessDayRange(at) };
  });
  const oldestDay = sevenDays[0]!;
  const windowStart = oldestDay.range.start;

  const [todayCounts, statusCounts, paymentsByMethod, itemRows, dailyCounts, windowPayments] =
    await Promise.all([
      // Four counts over the same day and the same index, in one pass.
      prisma.$queryRaw<Array<{ total: bigint; paid: bigint; completed: bigint; cancelled: bigint }>>`
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE "paidAt" IS NOT NULL) AS paid,
          count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
          count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
        FROM transactions
        WHERE "businessDate" = ${today}::date
      `,

      // Both all-time queue figures come from one grouping.
      prisma.transaction.groupBy({ by: ["status"], _count: { _all: true } }),

      // The day's total revenue is the sum of these groups — no second query.
      prisma.transactionPayment.groupBy({
        by: ["method"],
        where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
        _sum: { amountDue: true },
        _count: true,
      }),

      prisma.transactionItem.findMany({
        where: { transaction: { businessDate: today, status: { not: "CANCELLED" } } },
        select: { serviceName: true, quantity: true, lineTotal: true },
      }),

      // One grouping covers all seven days; businessDate is a real date column,
      // so this needs no timezone arithmetic.
      prisma.transaction.groupBy({
        by: ["businessDate"],
        where: { businessDate: { gte: oldestDay.key, lte: today } },
        _count: { _all: true },
      }),

      /*
       * Payments are bucketed by `createdAt` falling inside each shop day's
       * range — the same rule the old per-day loop used, preserved exactly.
       * Only two small columns are selected, and the window is seven days, so
       * this stays a few hundred rows for a busy shop. If the shop ever grows
       * past that, this becomes a raw GROUP BY on a timezone-shifted date.
       */
      prisma.transactionPayment.findMany({
        where: { status: "CAPTURED", createdAt: { gte: windowStart, lt: end } },
        select: { createdAt: true, amountDue: true },
      }),
    ]);

  const todayRow = todayCounts[0];
  const transactionsToday = Number(todayRow?.total ?? 0);
  const paidToday = Number(todayRow?.paid ?? 0);
  const completedToday = Number(todayRow?.completed ?? 0);
  const cancelledToday = Number(todayRow?.cancelled ?? 0);

  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const pendingCount = countByStatus.get("PENDING") ?? 0;
  const inQueueCount = (ACTIVE_QUEUE_STATUSES as unknown as TransactionStatus[]).reduce(
    (sum, status) => sum + (countByStatus.get(status) ?? 0),
    0,
  );

  const revenueToday = paymentsByMethod.reduce(
    (sum, row) => sum + Number(row._sum.amountDue ?? 0),
    0,
  );
  const paidCount = paymentsByMethod.reduce((sum, row) => sum + row._count, 0);

  const serviceTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of itemRows) {
    const entry = serviceTotals.get(item.serviceName) ?? { quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.lineTotal);
    serviceTotals.set(item.serviceName, entry);
  }

  const topServicesToday = [...serviceTotals.entries()]
    .map(([serviceName, value]) => ({
      serviceName,
      quantity: value.quantity,
      revenue: value.revenue.toFixed(2),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 5);

  return {
    businessDate: today.toISOString().slice(0, 10),
    transactionsToday,
    paidTransactionsToday: paidToday,
    revenueToday: toAmountString(revenueToday),
    averageTicketToday:
      paidCount > 0 ? toAmountString(Number(revenueToday) / paidCount) : "0.00",
    pendingCount,
    inQueueCount,
    completedToday,
    cancelledToday,
    topServicesToday,
    revenueByMethodToday: paymentsByMethod.map((row) => ({
      method: row.method,
      amount: toAmountString(row._sum.amountDue ?? 0),
      count: row._count,
    })),
    // Assembled in memory from the two windowed queries above — no extra
    // round trips, and none of them sequential.
    lastSevenDays: sevenDays.map((day) => {
      const transactions = dailyCounts.find(
        (row) => row.businessDate.getTime() === day.key.getTime(),
      );
      const revenue = windowPayments.reduce(
        (sum, payment) =>
          payment.createdAt >= day.range.start && payment.createdAt < day.range.end
            ? sum + Number(payment.amountDue)
            : sum,
        0,
      );
      return {
        date: day.key.toISOString().slice(0, 10),
        revenue: toAmountString(revenue),
        transactions: transactions?._count._all ?? 0,
      };
    }),
  };
}

export interface SalesReport {
  from: string;
  to: string;
  totalRevenue: string;
  transactionCount: number;
  paidCount: number;
  cancelledCount: number;
  averageTicket: string;
  byMethod: Array<{ method: string; amount: string; count: number }>;
  byService: Array<{ serviceName: string; quantity: number; revenue: string }>;
  byVehicle: Array<{ vehicle: string; count: number; revenue: string }>;
  byCashier: Array<{ name: string; count: number; revenue: string }>;

  // --- added for the analytics dashboard -----------------------------------
  /** Vehicles processed — a paid transaction is one vehicle through the bay. */
  vehiclesServed: number;
  /** Same figures for the immediately preceding window of equal length. */
  previous: {
    from: string;
    to: string;
    totalRevenue: string;
    transactionCount: number;
    paidCount: number;
    cancelledCount: number;
    averageTicket: string;
    vehiclesServed: number;
  };
  /** One point per business day in range, oldest first. */
  trend: Array<{ date: string; revenue: string; transactions: number }>;
  /** Trading-hour bands, for spotting when the shop is actually busy. */
  byHourBand: Array<{ band: string; count: number; revenue: string }>;
  peakBand: { band: string; count: number; share: number } | null;
  cashierPerformance: Array<{
    name: string;
    transactions: number;
    revenue: string;
    averageTicket: string;
    cancelled: number;
    /** Share of the period's revenue, 0–100. */
    performance: number;
  }>;
  cancellation: {
    count: number;
    /** Value of what was cancelled, from the transaction totals. */
    amount: string;
    /** Cancelled ÷ all transactions, 0–100. */
    rate: number;
    topCashier: { name: string; count: number } | null;
  };
  bestDay: { date: string; revenue: string } | null;
}

/**
 * Trading-hour bands. Deliberately coarse: a car wash cares about "busy in the
 * afternoon", not about 14:00 versus 15:00, and coarse bands stay readable on a
 * donut. Anything outside opening hours falls into the final band.
 */
const HOUR_BANDS: ReadonlyArray<{ label: string; startHour: number; endHour: number }> = [
  { label: "6 AM – 8 AM", startHour: 6, endHour: 8 },
  { label: "8 AM – 12 PM", startHour: 8, endHour: 12 },
  { label: "12 PM – 4 PM", startHour: 12, endHour: 16 },
  { label: "4 PM – 8 PM", startHour: 16, endHour: 20 },
  { label: "8 PM – 12 AM", startHour: 20, endHour: 24 },
];

/** Hour of day in the SHOP's timezone — not the server's, which is UTC. */
function shopHour(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(at),
  );
}

function bandFor(hour: number): string {
  const band = HOUR_BANDS.find((entry) => hour >= entry.startHour && hour < entry.endHour);
  // Overnight/early-morning work is rare but must not vanish from the totals.
  return band?.label ?? "8 PM – 12 AM";
}

export async function getSalesReport(fromKey: string, toKey: string): Promise<SalesReport> {
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);
  const { start } = businessDayRange(from);
  const { end } = businessDayRange(to);

  /*
   * The immediately preceding window of EQUAL length, so "vs previous period"
   * compares like with like: a 7-day report is compared against the 7 days
   * before it, a single day against the day before.
   */
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * dayMs);
  const prevRange = { start: businessDayRange(prevFrom).start, end: businessDayRange(prevTo).end };

  /*
   * Four statements, all in parallel, for the entire dashboard. Every chart on
   * the page is derived from these in memory — adding a donut costs no extra
   * round trip. Payments are fetched as rows rather than pre-grouped because the
   * same rows feed the method donut, the daily trend AND the hour bands; three
   * groupBys would cost three round trips for data we already have.
   */
  const [transactions, payments, items, previousRaw] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessDate: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        paidAt: true,
        total: true,
        createdAt: true,
        businessDate: true,
        vehicleCategoryName: true,
        vehicleVariantName: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.transactionPayment.findMany({
      where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
      select: { method: true, amountDue: true, createdAt: true },
    }),
    prisma.transactionItem.findMany({
      where: {
        transaction: { businessDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      },
      select: { serviceName: true, quantity: true, lineTotal: true },
    }),
    // The previous period is only ever shown as a handful of comparison
    // numbers, so it is aggregated in the database rather than fetched.
    prisma.$queryRaw<
      Array<{ revenue: string | null; total: bigint; paid: bigint; cancelled: bigint }>
    >`
      SELECT
        (SELECT SUM("amountDue") FROM transaction_payments
          WHERE status = 'CAPTURED' AND "createdAt" >= ${prevRange.start} AND "createdAt" < ${prevRange.end}
        ) AS revenue,
        count(*) AS total,
        count(*) FILTER (WHERE "paidAt" IS NOT NULL) AS paid,
        count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
      FROM transactions
      WHERE "businessDate" >= ${prevFrom}::date AND "businessDate" <= ${prevTo}::date
    `,
  ]);

  const paid = transactions.filter((t) => t.paidAt !== null);
  const totalRevenue = payments.reduce((sum, row) => sum + Number(row.amountDue), 0);

  // byMethod, previously a groupBy, now folded from the rows already fetched.
  const methodTotals = new Map<string, { amount: number; count: number }>();
  for (const payment of payments) {
    const entry = methodTotals.get(payment.method) ?? { amount: 0, count: 0 };
    entry.amount += Number(payment.amountDue);
    entry.count += 1;
    methodTotals.set(payment.method, entry);
  }

  const serviceTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of items) {
    const entry = serviceTotals.get(item.serviceName) ?? { quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.lineTotal);
    serviceTotals.set(item.serviceName, entry);
  }

  const vehicleTotals = new Map<string, { count: number; revenue: number }>();
  const cashierTotals = new Map<string, { count: number; revenue: number }>();
  for (const transaction of paid) {
    const vehicle =
      buildVehicleLabel(transaction.vehicleCategoryName, transaction.vehicleVariantName) ??
      "Unspecified";

    const vehicleEntry = vehicleTotals.get(vehicle) ?? { count: 0, revenue: 0 };
    vehicleEntry.count += 1;
    vehicleEntry.revenue += Number(transaction.total);
    vehicleTotals.set(vehicle, vehicleEntry);

    const cashier = transaction.createdBy.name;
    const cashierEntry = cashierTotals.get(cashier) ?? { count: 0, revenue: 0 };
    cashierEntry.count += 1;
    cashierEntry.revenue += Number(transaction.total);
    cashierTotals.set(cashier, cashierEntry);
  }

  const cancelledTransactions = transactions.filter((t) => t.status === "CANCELLED");
  const timeZone = getBusinessTimezone();

  // --- daily trend: one point per calendar day in range, gaps included so the
  // line shows a quiet day as a dip rather than skipping it entirely ----------
  const revenueByDay = new Map<string, number>();
  for (const payment of payments) {
    const key = businessDateKey(payment.createdAt, timeZone);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + Number(payment.amountDue));
  }
  const countByDay = new Map<string, number>();
  for (const transaction of transactions) {
    const key = transaction.businessDate.toISOString().slice(0, 10);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }
  const trend: Array<{ date: string; revenue: string; transactions: number }> = [];
  for (let offset = 0; offset < spanDays; offset += 1) {
    const key = new Date(from.getTime() + offset * dayMs).toISOString().slice(0, 10);
    trend.push({
      date: key,
      revenue: toAmountString(revenueByDay.get(key) ?? 0),
      transactions: countByDay.get(key) ?? 0,
    });
  }

  const bestDayEntry = [...trend].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];

  // --- trading-hour bands ----------------------------------------------------
  const bandTotals = new Map<string, { count: number; revenue: number }>();
  for (const band of HOUR_BANDS) bandTotals.set(band.label, { count: 0, revenue: 0 });
  for (const transaction of transactions) {
    const label = bandFor(shopHour(transaction.createdAt, timeZone));
    const entry = bandTotals.get(label)!;
    entry.count += 1;
    if (transaction.paidAt) entry.revenue += Number(transaction.total);
  }
  const byHourBand = HOUR_BANDS.map((band) => {
    const entry = bandTotals.get(band.label)!;
    return { band: band.label, count: entry.count, revenue: toAmountString(entry.revenue) };
  });
  const busiest = [...byHourBand].sort((a, b) => b.count - a.count)[0];
  const peakBand =
    busiest && busiest.count > 0
      ? {
          band: busiest.band,
          count: busiest.count,
          share: Math.round((busiest.count / transactions.length) * 100),
        }
      : null;

  // --- cashier performance ---------------------------------------------------
  const cancelledByCashier = new Map<string, number>();
  for (const transaction of cancelledTransactions) {
    const name = transaction.createdBy.name;
    cancelledByCashier.set(name, (cancelledByCashier.get(name) ?? 0) + 1);
  }
  const cashierPerformance = [...cashierTotals.entries()]
    .map(([name, value]) => ({
      name,
      transactions: value.count,
      revenue: toAmountString(value.revenue),
      averageTicket: value.count > 0 ? toAmountString(value.revenue / value.count) : "0.00",
      cancelled: cancelledByCashier.get(name) ?? 0,
      performance: totalRevenue > 0 ? Math.round((value.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));

  const topCancellingCashier = [...cancelledByCashier.entries()].sort((a, b) => b[1] - a[1])[0];

  const prev = previousRaw[0];
  const previousRevenue = Number(prev?.revenue ?? 0);
  const previousPaid = Number(prev?.paid ?? 0);

  return {
    from: fromKey,
    to: toKey,
    totalRevenue: toAmountString(totalRevenue),
    transactionCount: transactions.length,
    paidCount: paid.length,
    cancelledCount: cancelledTransactions.length,
    averageTicket: paid.length > 0 ? toAmountString(totalRevenue / paid.length) : "0.00",
    vehiclesServed: paid.length,
    previous: {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10),
      totalRevenue: toAmountString(previousRevenue),
      transactionCount: Number(prev?.total ?? 0),
      paidCount: previousPaid,
      cancelledCount: Number(prev?.cancelled ?? 0),
      averageTicket: previousPaid > 0 ? toAmountString(previousRevenue / previousPaid) : "0.00",
      vehiclesServed: previousPaid,
    },
    trend,
    byHourBand,
    peakBand,
    cashierPerformance,
    cancellation: {
      count: cancelledTransactions.length,
      amount: toAmountString(
        cancelledTransactions.reduce((sum, t) => sum + Number(t.total), 0),
      ),
      rate:
        transactions.length > 0
          ? Math.round((cancelledTransactions.length / transactions.length) * 100)
          : 0,
      topCashier: topCancellingCashier
        ? { name: topCancellingCashier[0], count: topCancellingCashier[1] }
        : null,
    },
    bestDay:
      bestDayEntry && Number(bestDayEntry.revenue) > 0
        ? { date: bestDayEntry.date, revenue: bestDayEntry.revenue }
        : null,
    byMethod: [...methodTotals.entries()]
      .map(([method, value]) => ({
        method,
        amount: toAmountString(value.amount),
        count: value.count,
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
    byService: [...serviceTotals.entries()]
      .map(([serviceName, value]) => ({
        serviceName,
        quantity: value.quantity,
        revenue: value.revenue.toFixed(2),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
    byVehicle: [...vehicleTotals.entries()]
      .map(([vehicle, value]) => ({
        vehicle,
        count: value.count,
        revenue: value.revenue.toFixed(2),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
    byCashier: [...cashierTotals.entries()]
      .map(([name, value]) => ({ name, count: value.count, revenue: value.revenue.toFixed(2) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
  };
}
