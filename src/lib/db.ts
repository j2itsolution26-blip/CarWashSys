import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton.
 *
 * Next.js dev-mode hot reload re-evaluates modules on every edit; without the
 * global cache each reload would open a new connection pool and exhaust the
 * database's connection limit within a few saves.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from "@prisma/client";
