import "server-only";
import { prisma } from "@/lib/db";
import { businessDate, businessDayRange } from "@/lib/business-date";
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

export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
  const today = businessDate(now);
  const { start, end } = businessDayRange(now);

  const [
    transactionsToday,
    paidToday,
    completedToday,
    cancelledToday,
    pendingCount,
    inQueueCount,
    paymentAggregate,
    paymentsByMethod,
    itemRows,
  ] = await Promise.all([
    prisma.transaction.count({ where: { businessDate: today } }),
    prisma.transaction.count({ where: { businessDate: today, paidAt: { not: null } } }),
    prisma.transaction.count({ where: { businessDate: today, status: "COMPLETED" } }),
    prisma.transaction.count({ where: { businessDate: today, status: "CANCELLED" } }),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    prisma.transaction.count({
      where: { status: { in: ACTIVE_QUEUE_STATUSES as unknown as TransactionStatus[] } },
    }),
    prisma.transactionPayment.aggregate({
      where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
      _sum: { amountDue: true },
      _count: true,
    }),
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
  ]);

  const revenueToday = paymentAggregate._sum.amountDue ?? 0;
  const paidCount = paymentAggregate._count;

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
    lastSevenDays: await getLastSevenDays(now),
  };
}

async function getLastSevenDays(
  now: Date,
): Promise<Array<{ date: string; revenue: string; transactions: number }>> {
  const days: Array<{ date: string; revenue: string; transactions: number }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const at = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const date = businessDate(at);
    const { start, end } = businessDayRange(at);

    const [revenue, count] = await Promise.all([
      prisma.transactionPayment.aggregate({
        where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
        _sum: { amountDue: true },
      }),
      prisma.transaction.count({ where: { businessDate: date } }),
    ]);

    days.push({
      date: date.toISOString().slice(0, 10),
      revenue: toAmountString(revenue._sum.amountDue ?? 0),
      transactions: count,
    });
  }

  return days;
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
}

export async function getSalesReport(fromKey: string, toKey: string): Promise<SalesReport> {
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);
  const { start } = businessDayRange(from);
  const { end } = businessDayRange(to);

  const [transactions, payments, items] = await Promise.all([
    prisma.transaction.findMany({
      where: { businessDate: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        paidAt: true,
        total: true,
        vehicleCategoryName: true,
        vehicleVariantName: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.transactionPayment.groupBy({
      by: ["method"],
      where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
      _sum: { amountDue: true },
      _count: true,
    }),
    prisma.transactionItem.findMany({
      where: {
        transaction: { businessDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      },
      select: { serviceName: true, quantity: true, lineTotal: true },
    }),
  ]);

  const paid = transactions.filter((t) => t.paidAt !== null);
  const totalRevenue = payments.reduce((sum, row) => sum + Number(row._sum.amountDue ?? 0), 0);

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

  return {
    from: fromKey,
    to: toKey,
    totalRevenue: toAmountString(totalRevenue),
    transactionCount: transactions.length,
    paidCount: paid.length,
    cancelledCount: transactions.filter((t) => t.status === "CANCELLED").length,
    averageTicket: paid.length > 0 ? toAmountString(totalRevenue / paid.length) : "0.00",
    byMethod: payments.map((row) => ({
      method: row.method,
      amount: toAmountString(row._sum.amountDue ?? 0),
      count: row._count,
    })),
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
