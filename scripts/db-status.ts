/**
 * Read-only snapshot of what is actually in the database.
 *
 * Useful after a reset/seed to confirm the system is in the state you think it
 * is — particularly "are there really no accounts yet?", which decides whether
 * owner self-registration is still open.
 *
 * Run with: npm run db:status
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [
    users,
    owners,
    pendingRegistrations,
    categories,
    variants,
    services,
    livePrices,
    transactions,
    payments,
    auditEntries,
    roles,
    permissions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { roles: { some: { role: { key: "OWNER" } } } } }),
    prisma.ownerRegistration.count({ where: { activeKey: { not: null }, consumedAt: null } }),
    prisma.vehicleCategory.count(),
    prisma.vehicleVariant.count(),
    prisma.service.count(),
    prisma.servicePrice.count({ where: { currentKey: { not: null } } }),
    prisma.transaction.count(),
    prisma.transactionPayment.count(),
    prisma.auditLog.count(),
    prisma.role.count(),
    prisma.permission.count(),
  ]);

  const ownerState =
    owners > 0 ? "ACTIVE" : pendingRegistrations > 0 ? "PENDING" : "NONE";

  console.log("\n=== CG Car Wash — database status ===\n");
  console.log("  Accounts");
  console.log(`    users .................. ${users}`);
  console.log(`    owners ................. ${owners}`);
  console.log(`    pending owner regs ..... ${pendingRegistrations}`);
  console.log(`    owner state ............ ${ownerState}`);
  console.log(
    `    self-registration ...... ${ownerState === "NONE" ? "OPEN — link visible on login" : "CLOSED"}`,
  );
  console.log("\n  Access control");
  console.log(`    roles .................. ${roles}`);
  console.log(`    permissions ............ ${permissions}`);
  console.log("\n  Catalog");
  console.log(`    vehicle categories ..... ${categories}`);
  console.log(`    vehicle types .......... ${variants}`);
  console.log(`    services ............... ${services}`);
  console.log(`    live prices ............ ${livePrices}`);
  console.log("\n  Ledger");
  console.log(`    transactions ........... ${transactions}`);
  console.log(`    payments ............... ${payments}`);
  console.log(`    audit entries .......... ${auditEntries}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error("\nCould not read the database:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
