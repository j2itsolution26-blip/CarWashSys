/**
 * Correctness check for the dashboard optimisation — `npm run perf:verify`.
 *
 * Recomputes every dashboard figure the ORIGINAL naive way (one query per
 * number, seven sequential day-loops) and compares it field by field against the
 * optimised `getDashboardMetrics`. The optimisation is only acceptable if the
 * numbers are byte-identical: a faster dashboard that reports different revenue
 * is not an optimisation, it is a bug.
 */
import { businessDate, businessDayRange } from "../src/lib/business-date";
import { toAmountString } from "../src/lib/money";
import { ACTIVE_QUEUE_STATUSES } from "../src/lib/transactions/status-machine";
import type { TransactionStatus } from "@prisma/client";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../src/lib/db") as { prisma: import("@prisma/client").PrismaClient };

/** The pre-optimisation implementation, kept here purely as the oracle. */
async function referenceMetrics(now = new Date()) {
  const today = businessDate(now);
  const { start, end } = businessDayRange(now);

  const transactionsToday = await prisma.transaction.count({ where: { businessDate: today } });
  const paidToday = await prisma.transaction.count({
    where: { businessDate: today, paidAt: { not: null } },
  });
  const completedToday = await prisma.transaction.count({
    where: { businessDate: today, status: "COMPLETED" },
  });
  const cancelledToday = await prisma.transaction.count({
    where: { businessDate: today, status: "CANCELLED" },
  });
  const pendingCount = await prisma.transaction.count({ where: { status: "PENDING" } });
  const inQueueCount = await prisma.transaction.count({
    where: { status: { in: ACTIVE_QUEUE_STATUSES as unknown as TransactionStatus[] } },
  });
  const paymentAggregate = await prisma.transactionPayment.aggregate({
    where: { status: "CAPTURED", createdAt: { gte: start, lt: end } },
    _sum: { amountDue: true },
    _count: true,
  });

  const lastSevenDays: Array<{ date: string; revenue: string; transactions: number }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const at = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const date = businessDate(at);
    const range = businessDayRange(at);
    const revenue = await prisma.transactionPayment.aggregate({
      where: { status: "CAPTURED", createdAt: { gte: range.start, lt: range.end } },
      _sum: { amountDue: true },
    });
    const count = await prisma.transaction.count({ where: { businessDate: date } });
    lastSevenDays.push({
      date: date.toISOString().slice(0, 10),
      revenue: toAmountString(revenue._sum.amountDue ?? 0),
      transactions: count,
    });
  }

  const revenue = paymentAggregate._sum.amountDue ?? 0;
  return {
    transactionsToday,
    paidTransactionsToday: paidToday,
    completedToday,
    cancelledToday,
    pendingCount,
    inQueueCount,
    revenueToday: toAmountString(revenue),
    averageTicketToday:
      paymentAggregate._count > 0
        ? toAmountString(Number(revenue) / paymentAggregate._count)
        : "0.00",
    lastSevenDays,
  };
}

async function main(): Promise<void> {
  const { getDashboardMetrics } = await import("../src/server/services/report.service");

  // Same instant for both, or a midnight rollover between them would look like
  // a mismatch.
  const now = new Date();
  const [actual, expected] = [await getDashboardMetrics(now), await referenceMetrics(now)];

  let failures = 0;
  const check = (field: string, a: unknown, b: unknown) => {
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same) failures += 1;
    console.log(
      `${same ? "PASS" : "FAIL"}  ${field.padEnd(24)} optimised=${JSON.stringify(a)}${
        same ? "" : `  reference=${JSON.stringify(b)}`
      }`,
    );
  };

  check("transactionsToday", actual.transactionsToday, expected.transactionsToday);
  check("paidTransactionsToday", actual.paidTransactionsToday, expected.paidTransactionsToday);
  check("completedToday", actual.completedToday, expected.completedToday);
  check("cancelledToday", actual.cancelledToday, expected.cancelledToday);
  check("pendingCount", actual.pendingCount, expected.pendingCount);
  check("inQueueCount", actual.inQueueCount, expected.inQueueCount);
  check("revenueToday", actual.revenueToday, expected.revenueToday);
  check("averageTicketToday", actual.averageTicketToday, expected.averageTicketToday);
  check("lastSevenDays", actual.lastSevenDays, expected.lastSevenDays);

  console.log(
    failures === 0
      ? "\n✓ Optimised dashboard matches the reference implementation exactly."
      : `\n✗ ${failures} field(s) differ — the optimisation changed the numbers.`,
  );
  if (failures > 0) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Verification failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
