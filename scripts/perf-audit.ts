/**
 * Performance audit — `npm run perf`.
 *
 * Measures the real cost of every screen's server work: how many SQL statements
 * it issues, how long each takes, and how much of the total is raw network
 * round-trip to the database rather than query execution.
 *
 * Run it before and after any optimisation. Numbers, not guesses.
 */
// Instrument the SHARED client the services actually use — a separate instance
// would report zero queries however busy the app is. Set before the import so
// the client is constructed with event logging enabled.
process.env.PRISMA_QUERY_LOG = "1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../src/lib/db") as {
  prisma: import("@prisma/client").PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>;
};

interface Captured {
  sql: string;
  ms: number;
}

let captured: Captured[] = [];

prisma.$on("query", (event) => {
  captured.push({ sql: event.query, ms: event.duration });
});

function reset(): void {
  captured = [];
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  reset();
  const start = performance.now();
  const result = await fn();
  const wall = performance.now() - start;

  const queries = captured.length;
  const dbTime = captured.reduce((sum, q) => sum + q.ms, 0);
  // Everything not spent executing SQL is round-trip latency + app time.
  const overhead = wall - dbTime;

  console.log(
    `${label.padEnd(34)} ${wall.toFixed(0).padStart(6)}ms  ` +
      `${String(queries).padStart(3)} queries  ` +
      `sql ${dbTime.toFixed(0).padStart(5)}ms  ` +
      `latency+app ${overhead.toFixed(0).padStart(5)}ms`,
  );

  // Surface anything that looks like an N+1: the same statement shape repeated.
  const shapes = new Map<string, number>();
  for (const q of captured) {
    const shape = q.sql.replace(/\$\d+/g, "?").slice(0, 90);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  for (const [shape, count] of shapes) {
    if (count >= 3) console.log(`      ⚠ N+1 suspect ×${count}: ${shape}`);
  }

  return result;
}

async function main(): Promise<void> {
  console.log("\n=== Raw database round-trip ===");
  /*
   * Warm the pool with a CONCURRENT burst, not a single query. Each additional
   * connection costs its own TLS handshake, so a cold pool makes the first
   * Promise.all look slower than sequential and every early measurement look
   * worse than steady state. This is also a real cost on a cold serverless
   * instance — see the report notes on Vercel cold starts.
   */
  await Promise.all(Array.from({ length: 8 }, () => prisma.$queryRaw`SELECT 1`));

  const pings: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    pings.push(performance.now() - t);
  }
  pings.sort((a, b) => a - b);
  const rtt = { min: pings[0] ?? 0, median: pings[3] ?? 0, max: pings[6] ?? 0 };
  console.log(
    `  SELECT 1  min ${rtt.min.toFixed(0)}ms  median ${rtt.median.toFixed(0)}ms  max ${rtt.max.toFixed(0)}ms`,
  );
  console.log(`  ^ this is the floor for EVERY sequential query on every page.`);

  /*
   * Does Promise.all actually overlap round trips, or does the pool serialise
   * them? If 6 concurrent pings cost ~6× a single ping, every "parallel"
   * Promise.all in the app is parallel in name only.
   */
  const seqStart = performance.now();
  for (let i = 0; i < 6; i++) await prisma.$queryRaw`SELECT 1`;
  const sequential = performance.now() - seqStart;

  const parStart = performance.now();
  await Promise.all(Array.from({ length: 6 }, () => prisma.$queryRaw`SELECT 1`));
  const parallel = performance.now() - parStart;

  console.log(
    `  6 queries  sequential ${sequential.toFixed(0)}ms  vs  parallel ${parallel.toFixed(0)}ms  ` +
      `(${(sequential / Math.max(parallel, 1)).toFixed(1)}× speedup)`,
  );
  console.log(
    parallel > sequential * 0.6
      ? "  ⚠ Promise.all is NOT overlapping round trips — check the connection limit.\n"
      : "  ✓ concurrency is working.\n",
  );

  console.log("=== Per-screen server cost ===");

  const { getPosCatalog } = await import("../src/server/services/catalog.service");
  const { getOpenTransactions, listTransactions } = await import(
    "../src/server/services/transaction.service"
  );
  const { getDashboardMetrics, getSalesReport } = await import(
    "../src/server/services/report.service"
  );

  const owner = {
    id: "audit",
    name: "audit",
    email: "audit@local",
    roles: ["OWNER"],
    permissions: ["pos:operate", "transaction:read:all", "report:read", "queue:read"],
  };

  await timed("POS  getPosCatalog", () => getPosCatalog());
  await timed("POS  getOpenTransactions", () => getOpenTransactions(owner as never));
  await timed("POS  page total (parallel)", async () => {
    await Promise.all([getPosCatalog(), getOpenTransactions(owner as never)]);
  });

  await timed("Transactions  listTransactions", () =>
    listTransactions({} as never, owner as never),
  );

  await timed("Dashboard  getDashboardMetrics", () => getDashboardMetrics());

  const today = new Date().toISOString().slice(0, 10);
  await timed("Reports  getSalesReport (1 day)", () => getSalesReport(today, today));
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await timed("Reports  getSalesReport (30 day)", () => getSalesReport(monthAgo, today));

  console.log("\n=== Index coverage on the hot paths ===");
  const indexes = await prisma.$queryRaw<Array<{ tablename: string; indexname: string; indexdef: string }>>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;
  let currentTable = "";
  for (const row of indexes) {
    if (row.tablename !== currentTable) {
      currentTable = row.tablename;
      console.log(`  ${currentTable}`);
    }
    const cols = row.indexdef.replace(/^.*\((.*)\)$/, "$1");
    console.log(`      ${row.indexname.padEnd(46)} (${cols})`);
  }

  console.log("\n=== Row counts (scan cost grows with these) ===");
  const counts = await prisma.$queryRaw<Array<{ table: string; rows: bigint }>>`
    SELECT 'transactions' AS table, count(*) AS rows FROM transactions
    UNION ALL SELECT 'transaction_items', count(*) FROM transaction_items
    UNION ALL SELECT 'transaction_payments', count(*) FROM transaction_payments
    UNION ALL SELECT 'service_prices', count(*) FROM service_prices
    UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
  `;
  for (const row of counts) {
    console.log(`  ${row.table.padEnd(20)} ${String(row.rows).padStart(8)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Audit failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
