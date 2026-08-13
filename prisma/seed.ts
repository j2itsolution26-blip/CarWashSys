/**
 * Idempotent seed: catalog, RBAC and the bootstrap owner account.
 *
 * Safe to re-run. Deliberately NON-destructive:
 *   * an existing price the owner has edited is never reset to the board value;
 *   * an existing user's password is never overwritten;
 *   * no transactions, customers or sales figures are ever created — the system
 *     ships with an empty ledger and real data only.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_DEFINITIONS,
  type RoleKey,
} from "../src/lib/permissions/permissions";
import { SEED_CATEGORIES, SEED_SERVICES } from "./seed-data";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

function log(step: string, detail = ""): void {
  console.log(`  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function seedPermissionsAndRoles(): Promise<void> {
  console.log("\n▸ Permissions & roles");

  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description, category: permission.category },
      create: {
        key: permission.key,
        description: permission.description,
        category: permission.category,
      },
    });
  }
  log(`${PERMISSION_CATALOG.length} permissions`);

  for (const role of ROLE_DEFINITIONS) {
    const record = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, sortOrder: role.sortOrder },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        sortOrder: role.sortOrder,
        isSystem: true,
      },
    });

    const permissionKeys = DEFAULT_ROLE_PERMISSIONS[role.key as RoleKey];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
      select: { id: true },
    });

    // createMany + skipDuplicates so re-seeding never disturbs a role the owner
    // has since customised beyond the defaults.
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: record.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    log(`${role.name}`, `${permissions.length} permissions`);
  }
}

/**
 * Bootstrap owner.
 *
 * PREFERRED PATH: leave `SEED_OWNER_PASSWORD` unset. The owner then creates
 * their own account from the login page and proves control of a Gmail address
 * before it activates — no shared default credential ever exists.
 *
 * Setting `SEED_OWNER_PASSWORD` is an escape hatch for an offline or
 * mail-less installation. It creates the owner directly, pre-verified, and
 * permanently closes self-registration (only one owner may exist).
 */
async function seedOwner(): Promise<void> {
  console.log("\n▸ Bootstrap owner account");

  const password = process.env.SEED_OWNER_PASSWORD ?? "";

  if (password.length === 0) {
    const ownerCount = await prisma.user.count({
      where: { roles: { some: { role: { key: "OWNER" } } } },
    });
    if (ownerCount > 0) {
      log("owner already exists", "self-registration is closed");
    } else {
      log("no owner seeded", 'create one via "Create Owner Account" on the login page');
    }
    return;
  }

  if (password.length < 8) {
    throw new Error(
      "SEED_OWNER_PASSWORD must be at least 8 characters, or left empty to use self-registration.",
    );
  }

  const email = (process.env.SEED_OWNER_EMAIL ?? "owner@cgcarwash.local").trim().toLowerCase();
  const name = process.env.SEED_OWNER_NAME ?? "CG Owner";

  const existingOwner = await prisma.user.findFirst({
    where: { roles: { some: { role: { key: "OWNER" } } } },
  });

  if (existingOwner) {
    log("owner already exists", `${existingOwner.email} (left unchanged)`);
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "OWNER" } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        ownerSingleton: true,
        roles: { connectOrCreate: {
          where: { userId_roleId: { userId: existing.id, roleId: ownerRole.id } },
          create: { roleId: ownerRole.id },
        } },
      },
    });
    log("existing account promoted to owner", email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      isActive: true,
      // Seeded directly by an operator with database access — that IS the
      // verification; there is no mailbox to prove control of.
      emailVerified: true,
      emailVerifiedAt: new Date(),
      ownerSingleton: true,
      roles: { create: { roleId: ownerRole.id } },
    },
  });
  log("owner created", `${email} (self-registration now closed)`);
}

/**
 * Accounts that predate email verification are treated as verified — they were
 * created by an administrator or by an earlier seed, and locking them out on
 * upgrade would be a self-inflicted outage.
 */
async function backfillEmailVerification(): Promise<void> {
  const result = await prisma.user.updateMany({
    where: { emailVerified: false },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  if (result.count > 0) {
    log("backfilled email verification", `${result.count} pre-existing account(s)`);
  }
}

async function seedCatalog(): Promise<void> {
  console.log("\n▸ Service catalog");

  for (const service of SEED_SERVICES) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: {
        name: service.name,
        description: service.description,
        allowsQuantity: service.allowsQuantity,
        sortOrder: service.sortOrder,
      },
      create: {
        slug: service.slug,
        name: service.name,
        description: service.description,
        allowsQuantity: service.allowsQuantity,
        sortOrder: service.sortOrder,
      },
    });
  }
  log(`${SEED_SERVICES.length} services`);

  console.log("\n▸ Vehicle categories, variants & prices");

  let created = 0;
  let preserved = 0;

  for (const category of SEED_CATEGORIES) {
    const categoryRecord = await prisma.vehicleCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        icon: category.icon,
        description: category.description,
        sortOrder: category.sortOrder,
      },
      create: {
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        description: category.description,
        sortOrder: category.sortOrder,
      },
    });

    for (const variant of category.variants) {
      const variantRecord = await prisma.vehicleVariant.upsert({
        where: { categoryId_slug: { categoryId: categoryRecord.id, slug: variant.slug } },
        update: {
          name: variant.name,
          minDisplacementCc: variant.minDisplacementCc ?? null,
          maxDisplacementCc: variant.maxDisplacementCc ?? null,
          sortOrder: variant.sortOrder,
        },
        create: {
          categoryId: categoryRecord.id,
          slug: variant.slug,
          name: variant.name,
          minDisplacementCc: variant.minDisplacementCc ?? null,
          maxDisplacementCc: variant.maxDisplacementCc ?? null,
          sortOrder: variant.sortOrder,
        },
      });

      for (const [serviceSlug, amount] of Object.entries(variant.prices)) {
        const service = await prisma.service.findUniqueOrThrow({ where: { slug: serviceSlug } });
        const currentKey = `${variantRecord.id}:${service.id}`;

        const existingPrice = await prisma.servicePrice.findUnique({ where: { currentKey } });

        if (existingPrice) {
          // The owner's number wins over the board value. Never reset live prices.
          preserved += 1;
          continue;
        }

        await prisma.servicePrice.create({
          data: {
            variantId: variantRecord.id,
            serviceId: service.id,
            amount,
            currentKey,
            note: "Initial price board",
          },
        });
        created += 1;
      }
    }

    log(category.name, `${category.variants.length} variant(s)`);
  }

  log("prices", `${created} created, ${preserved} preserved`);
}

async function seedCounters(): Promise<void> {
  console.log("\n▸ Counters");
  await prisma.counter.upsert({
    where: { scope_key: { scope: "transaction", key: "global" } },
    update: {},
    create: { scope: "transaction", key: "global", value: 0 },
  });
  log("transaction counter ready");
}

async function main(): Promise<void> {
  console.log("Seeding CG Car Wash POS…");
  await seedPermissionsAndRoles();
  await backfillEmailVerification();
  await seedOwner();
  await seedCatalog();
  await seedCounters();

  const [categories, services, prices, users] = await Promise.all([
    prisma.vehicleCategory.count(),
    prisma.service.count(),
    prisma.servicePrice.count({ where: { currentKey: { not: null } } }),
    prisma.user.count(),
  ]);

  console.log("\n✔ Seed complete");
  console.log(
    `  ${categories} categories · ${services} services · ${prices} live prices · ${users} user(s)`,
  );
  console.log("\n  Sign in with SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD, then change the password.\n");
}

main()
  .catch((error) => {
    console.error("\n✖ Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
