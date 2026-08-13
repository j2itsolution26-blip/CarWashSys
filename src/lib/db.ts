import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton.
 *
 * Next.js dev-mode hot reload re-evaluates modules on every edit; without the
 * global cache each reload would open a new connection pool and exhaust the
 * database's connection limit within a few saves.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * With PRISMA_QUERY_LOG=1 the client emits a `query` event per statement so
 * `npm run perf` can count statements and attribute time per screen. Off by
 * default — event logging on every request would itself cost measurable time.
 */
const queryLogging = process.env.PRISMA_QUERY_LOG === "1";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: queryLogging
      ? [{ emit: "event", level: "query" }, "warn", "error"]
      : process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from "@prisma/client";
