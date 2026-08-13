import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

/**
 * Unit tests target the pure domain layer only (pricing, money, state machine,
 * numbering). Those modules deliberately have no Prisma or React imports, so the
 * suite runs in milliseconds with no database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
