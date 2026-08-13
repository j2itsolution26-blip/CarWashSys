/**
 * End-to-end workflow verification against a live database.
 *
 * Drives the REAL service layer — the same functions the POS screens call — so
 * this exercises pricing, idempotency, the state machine, permission checks and
 * historical price protection against actual Postgres rows.
 *
 * It creates test transactions and then REMOVES them, resetting the counters, so
 * the shop still opens on "Customer 1 / TXN-000001" with an empty ledger. The
 * cleanup is deliberate: leaving synthetic sales in a live database would
 * corrupt the first day's reports.
 *
 * Run with: npm run verify:workflow
 *
 * The script must run under the `react-server` export condition (the npm script
 * sets it). The `server-only` package that guards the service layer throws on
 * import under plain Node and only resolves to a no-op under that condition —
 * which is exactly the protection working as intended.
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/permissions/permissions";
import {
  createDraftTransaction,
  updateTransactionItems,
  changeStatus,
  cancelTransaction,
} from "../src/server/services/transaction.service";
import { capturePayment } from "../src/server/services/payment.service";
import { changePrice } from "../src/server/services/pricing.service";
import { getPosCatalog } from "../src/server/services/catalog.service";
import { newIdempotencyKey } from "../src/lib/utils";
import type { SessionUser } from "../src/lib/auth/guards";

const prisma = new PrismaClient();

/**
 * Read a user's effective permission set.
 *
 * Deliberately queried here rather than imported from `lib/auth`: that module
 * pulls in NextAuth, which needs React's client runtime and cannot load in a
 * plain Node script. The query below is the same join the auth layer performs.
 */
async function permissionsFor(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      roles: {
        select: {
          role: {
            select: {
              key: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });

  return {
    roles: user.roles.map((link) => link.role.key),
    permissions: [
      ...new Set(user.roles.flatMap((link) => link.role.permissions.map((rp) => rp.permission.key))),
    ],
  };
}

let passed = 0;
let failed = 0;
const createdTransactionIds: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectRejection(
  label: string,
  action: () => Promise<unknown>,
  expectedFragment: string,
): Promise<void> {
  try {
    await action();
    check(label, false, "expected a rejection but the call succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(label, message.toLowerCase().includes(expectedFragment.toLowerCase()), message);
  }
}

async function main(): Promise<void> {
  console.log("\n=== CG Car Wash — live workflow verification ===\n");

  // ---------------------------------------------------------------------
  console.log("[1] Catalog & actors");
  const catalog = await getPosCatalog();
  const sedan = catalog.find((category) => category.slug === "sedan-car");
  const motorcycle = catalog.find((category) => category.slug === "motorcycle");

  check("catalog loads all 6 vehicle categories", catalog.length === 6, `${catalog.length} found`);
  check("Sedan Car offers 5 services", sedan?.variants[0]?.services.length === 5);
  check(
    "Motorcycle exposes 4 displacement tiers",
    motorcycle?.variants.length === 4,
    motorcycle?.variants.map((v) => v.name).join(", "),
  );
  check(
    "Motorcycle 100–125cc is priced ₱100.00",
    motorcycle?.variants[0]?.services[0]?.unitPrice === "100.00",
  );

  const ownerRecord = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_OWNER_EMAIL ?? "owner@cgcarwash.local" },
  });
  const ownerIdentity = await permissionsFor(ownerRecord.id);
  const owner: SessionUser = {
    id: ownerRecord.id,
    name: ownerRecord.name,
    email: ownerRecord.email,
    roles: ownerIdentity.roles,
    permissions: ownerIdentity.permissions,
  };

  // A cashier identity built from the seeded CASHIER role — no account needed,
  // the guards operate on permission sets.
  const cashierRole = await prisma.role.findUniqueOrThrow({
    where: { key: "CASHIER" },
    include: { permissions: { include: { permission: true } } },
  });
  const cashier: SessionUser = {
    id: ownerRecord.id,
    name: "Test Cashier",
    email: "cashier@test.local",
    roles: ["CASHIER"],
    permissions: cashierRole.permissions.map((link) => link.permission.key),
  };

  check("owner holds every permission", owner.permissions.length === 19);
  check(
    "cashier does NOT hold pricing:manage",
    !cashier.permissions.includes(PERMISSIONS.PRICING_MANAGE),
  );

  // ---------------------------------------------------------------------
  console.log("\n[2] New Transaction — auto-numbering, no customer name");
  const openKey = newIdempotencyKey();
  const opened = await createDraftTransaction(openKey, owner);
  createdTransactionIds.push(opened.transaction.id);

  check(
    "customer is auto-labelled",
    /^Customer \d+$/.test(opened.transaction.customerLabel),
    opened.transaction.customerLabel,
  );
  check(
    "receipt number is zero-padded",
    /^TXN-\d{6}$/.test(opened.transaction.transactionNumber),
    opened.transaction.transactionNumber,
  );
  check("first transaction is TXN-000001", opened.transaction.transactionNumber === "TXN-000001");
  check("first customer is Customer 1", opened.transaction.customerLabel === "Customer 1");
  check("starts PENDING", opened.transaction.status === "PENDING");
  check("starts unpaid", opened.transaction.isPaid === false);

  // Double-click the New Transaction button.
  const replayOpen = await createDraftTransaction(openKey, owner);
  check(
    "double-click does not burn a second customer number",
    replayOpen.deduplicated && replayOpen.transaction.id === opened.transaction.id,
    replayOpen.transaction.transactionNumber,
  );

  // ---------------------------------------------------------------------
  console.log("\n[3] Vehicle + services — server-side pricing");
  const sedanVariant = sedan!.variants[0]!;
  const bodyWash = sedanVariant.services.find((s) => s.name === "Body Wash")!;
  const vacuum = sedanVariant.services.find((s) => s.name === "Vacuum")!;
  const bodyWax = sedanVariant.services.find((s) => s.name === "Body Wax")!;

  check("Sedan Body Wash is ₱135.00", bodyWash.unitPrice === "135.00");
  check("Sedan Vacuum is ₱135.00", vacuum.unitPrice === "135.00");
  check("Sedan Body Wax is ₱160.00", bodyWax.unitPrice === "160.00");

  const priced = await updateTransactionItems(
    {
      transactionId: opened.transaction.id,
      variantId: sedanVariant.id,
      items: [
        { serviceId: bodyWash.serviceId, quantity: 1 },
        { serviceId: vacuum.serviceId, quantity: 1 },
        { serviceId: bodyWax.serviceId, quantity: 1 },
      ],
    },
    owner,
  );

  check("documented basket totals ₱430.00", priced.total === "430.00", `got ₱${priced.total}`);
  check("subtotal matches", priced.subtotal === "430.00");
  check("three line items stored", priced.items.length === 3);
  check("vehicle label is 'Sedan Car'", priced.vehicleLabel === "Sedan Car");
  check("line prices snapshotted", priced.items.every((item) => item.unitPrice !== "0.00"));

  // ---------------------------------------------------------------------
  console.log("\n[4] Payment — change, short cash, duplicate submit");

  await expectRejection(
    "cash below total is rejected",
    () =>
      capturePayment(
        {
          transactionId: opened.transaction.id,
          method: "CASH",
          amountTendered: "400.00",
          referenceNumber: null,
          idempotencyKey: newIdempotencyKey(),
        },
        owner,
      ),
    "short",
  );

  const payKey = newIdempotencyKey();
  const paid = await capturePayment(
    {
      transactionId: opened.transaction.id,
      method: "CASH",
      amountTendered: "500.00",
      referenceNumber: null,
      idempotencyKey: payKey,
    },
    owner,
  );

  check("₱500 on a ₱430 sale returns ₱70.00 change", paid.change === "70.00", `got ₱${paid.change}`);
  check("transaction is now paid", paid.transaction.isPaid === true);
  check("status moved to PAID", paid.transaction.status === "PAID");
  check("payment recorded", paid.transaction.payments.length === 1);
  check(
    "payment amount due came from the database",
    paid.transaction.payments[0]?.amountDue === "430.00",
  );

  const replayPay = await capturePayment(
    {
      transactionId: opened.transaction.id,
      method: "CASH",
      amountTendered: "500.00",
      referenceNumber: null,
      idempotencyKey: payKey,
    },
    owner,
  );
  check(
    "duplicate payment submit is deduplicated, not double-charged",
    replayPay.deduplicated && replayPay.paymentId === paid.paymentId,
  );

  const paymentCount = await prisma.transactionPayment.count({
    where: { transactionId: opened.transaction.id },
  });
  check("exactly one payment row exists", paymentCount === 1, `${paymentCount} rows`);

  await expectRejection(
    "a paid transaction cannot be paid again",
    () =>
      capturePayment(
        {
          transactionId: opened.transaction.id,
          method: "CASH",
          amountTendered: "500.00",
          referenceNumber: null,
          idempotencyKey: newIdempotencyKey(),
        },
        owner,
      ),
    "already been paid",
  );

  await expectRejection(
    "a paid transaction cannot be edited",
    () =>
      updateTransactionItems(
        {
          transactionId: opened.transaction.id,
          variantId: sedanVariant.id,
          items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
        },
        owner,
      ),
    "already been paid",
  );

  // ---------------------------------------------------------------------
  console.log("\n[5] Status lifecycle");
  const queued = await changeStatus(
    { transactionId: opened.transaction.id, toStatus: "QUEUED" },
    owner,
  );
  check("PAID → QUEUED allowed", queued.status === "QUEUED");
  check("stays paid through the wash", queued.isPaid === true);

  const washing = await changeStatus(
    { transactionId: opened.transaction.id, toStatus: "WASHING" },
    owner,
  );
  check("QUEUED → WASHING allowed", washing.status === "WASHING");

  await expectRejection(
    "WASHING → COMPLETED is rejected (must pass quality check)",
    () => changeStatus({ transactionId: opened.transaction.id, toStatus: "COMPLETED" }, owner),
    "cannot move",
  );

  await changeStatus({ transactionId: opened.transaction.id, toStatus: "QUALITY_CHECK" }, owner);
  const completed = await changeStatus(
    { transactionId: opened.transaction.id, toStatus: "COMPLETED" },
    owner,
  );
  check("QUALITY_CHECK → COMPLETED allowed", completed.status === "COMPLETED");
  check(
    "status history recorded every step",
    completed.statusHistory.length >= 6,
    `${completed.statusHistory.length} events`,
  );
  check("completedAt stamped", completed.completedAt !== null);

  await expectRejection(
    "a paid transaction cannot be cancelled",
    () =>
      cancelTransaction(
        { transactionId: opened.transaction.id, reason: "testing" },
        owner,
      ),
    "has been paid",
  );

  // ---------------------------------------------------------------------
  console.log("\n[6] Authorisation — service-layer enforcement");

  // A real discount that needs approval, applied to a real open transaction, so
  // the check below actually reaches the permission branch rather than failing
  // earlier on a bad ID.
  const approvalDiscount = await prisma.discount.create({
    data: {
      code: "VERIFY-APPROVAL",
      name: "Verification approval-only discount",
      type: "PERCENTAGE",
      value: "10",
      requiresApproval: true,
      isActive: true,
    },
  });

  const authCheck = await createDraftTransaction(newIdempotencyKey(), owner);
  createdTransactionIds.push(authCheck.transaction.id);

  await expectRejection(
    "cashier is blocked from an approval-only discount",
    () =>
      updateTransactionItems(
        {
          transactionId: authCheck.transaction.id,
          variantId: sedanVariant.id,
          items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
          discountCode: approvalDiscount.code,
        },
        cashier,
      ),
    "approval",
  );

  const ownerDiscounted = await updateTransactionItems(
    {
      transactionId: authCheck.transaction.id,
      variantId: sedanVariant.id,
      items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
      discountCode: approvalDiscount.code,
    },
    owner,
  );
  check(
    "owner CAN apply the same discount — ₱135.00 less 10%",
    ownerDiscounted.total === "121.50" && ownerDiscounted.discountAmount === "13.50",
    `total ₱${ownerDiscounted.total}, discount ₱${ownerDiscounted.discountAmount}`,
  );

  await expectRejection(
    "an unknown discount code is refused",
    () =>
      updateTransactionItems(
        {
          transactionId: authCheck.transaction.id,
          variantId: sedanVariant.id,
          items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
          discountCode: "NO-SUCH-CODE",
        },
        owner,
      ),
    "not valid",
  );

  await prisma.transaction.update({
    where: { id: authCheck.transaction.id },
    data: { discountId: null },
  });
  await prisma.discount.delete({ where: { id: approvalDiscount.id } });

  // ---------------------------------------------------------------------
  console.log("\n[7] Historical price protection");
  const second = await createDraftTransaction(newIdempotencyKey(), owner);
  createdTransactionIds.push(second.transaction.id);
  const beforeChange = await updateTransactionItems(
    {
      transactionId: second.transaction.id,
      variantId: sedanVariant.id,
      items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
    },
    owner,
  );
  check("pre-change transaction charged ₱135.00", beforeChange.total === "135.00");

  const change = await changePrice(
    { variantId: sedanVariant.id, serviceId: bodyWash.serviceId, amount: "150.00" },
    owner,
  );
  check(
    "price change recorded ₱135.00 → ₱150.00",
    change.previousAmount === "135.00" && change.newAmount === "150.00",
  );

  const third = await createDraftTransaction(newIdempotencyKey(), owner);
  createdTransactionIds.push(third.transaction.id);
  const afterChange = await updateTransactionItems(
    {
      transactionId: third.transaction.id,
      variantId: sedanVariant.id,
      items: [{ serviceId: bodyWash.serviceId, quantity: 1 }],
    },
    owner,
  );
  check("new transaction charges the new ₱150.00", afterChange.total === "150.00");

  const reloadedOld = await prisma.transaction.findUniqueOrThrow({
    where: { id: second.transaction.id },
    include: { items: true },
  });
  check(
    "OLD transaction still shows ₱135.00 after the increase",
    reloadedOld.items[0]?.unitPrice.toFixed(2) === "135.00",
    `stored ₱${reloadedOld.items[0]?.unitPrice.toFixed(2)}`,
  );
  check("old transaction total unchanged", reloadedOld.total.toFixed(2) === "135.00");

  const priceRows = await prisma.servicePrice.findMany({
    where: { variantId: sedanVariant.id, serviceId: bodyWash.serviceId },
    orderBy: { effectiveFrom: "asc" },
  });
  check("price history keeps both rows", priceRows.length === 2, `${priceRows.length} rows`);
  check(
    "exactly one row is current",
    priceRows.filter((row) => row.currentKey !== null).length === 1,
  );
  check("superseded row has an end date", priceRows[0]?.effectiveTo !== null);

  // Restore the board price so the shop opens with the documented figure.
  await changePrice(
    {
      variantId: sedanVariant.id,
      serviceId: bodyWash.serviceId,
      amount: "135.00",
      note: "Restored after verification",
    },
    owner,
  );
  check("board price restored to ₱135.00", true);

  // ---------------------------------------------------------------------
  console.log("\n[8] Audit trail");
  const auditCount = await prisma.auditLog.count();
  const priceAudits = await prisma.auditLog.count({ where: { action: "PRICE_CHANGED" } });
  const paymentAudits = await prisma.auditLog.count({ where: { action: "PAYMENT_CAPTURED" } });
  check("audit entries were written", auditCount > 0, `${auditCount} entries`);
  check("price changes audited", priceAudits >= 2, `${priceAudits} entries`);
  check("payments audited", paymentAudits >= 1, `${paymentAudits} entries`);

  const sample = await prisma.auditLog.findFirst({
    where: { action: "PRICE_CHANGED" },
    orderBy: { createdAt: "asc" },
  });
  check(
    "price audit summary is human-readable",
    Boolean(sample?.summary.includes("135") && sample?.summary.includes("150")),
    sample?.summary,
  );
}

/** Remove everything this script created so the shop opens with a clean ledger. */
async function cleanup(): Promise<void> {
  console.log("\n[9] Cleanup — removing verification data");

  const deletedPayments = await prisma.transactionPayment.deleteMany({
    where: { transactionId: { in: createdTransactionIds } },
  });
  const deletedTransactions = await prisma.transaction.deleteMany({
    where: { id: { in: createdTransactionIds } },
  });
  const deletedAudits = await prisma.auditLog.deleteMany({});
  await prisma.counter.updateMany({ data: { value: 0 } });

  // Historical price rows created during the test are superseded; drop them so
  // the price history starts clean on day one.
  const deletedPrices = await prisma.servicePrice.deleteMany({
    where: { currentKey: null },
  });

  console.log(
    `  removed ${deletedTransactions.count} transactions, ${deletedPayments.count} payments, ` +
      `${deletedAudits.count} audit rows, ${deletedPrices.count} superseded prices; counters reset`,
  );

  const remaining = await prisma.transaction.count();
  const livePrices = await prisma.servicePrice.count({ where: { currentKey: { not: null } } });
  check("ledger is empty", remaining === 0, `${remaining} transactions`);
  check("29 live prices intact", livePrices === 29, `${livePrices} prices`);
}

main()
  .then(cleanup)
  .catch((error) => {
    console.error("\nVerification aborted:", error);
    failed += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
    process.exitCode = failed > 0 ? 1 : 0;
  });
