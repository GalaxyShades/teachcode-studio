import { it, expect, vi, afterEach } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("reports a missing SQLite file without creating it", async () => {
  vi.stubEnv("DATABASE_MODE", "sqlite");
  vi.stubEnv(
    "SQLITE_DATABASE_PATH",
    "/tmp/teachcode-definitely-missing-directory/database.db",
  );
  const { db } = await import("../lib/db");
  expect(() => db()).toThrow("npm run db:init:sqlite");
});
it("requires an explicit PostgreSQL URL", async () => {
  vi.stubEnv("DATABASE_MODE", "postgres");
  vi.stubEnv("DATABASE_URL", "");
  const { db } = await import("../lib/db");
  expect(() => db()).toThrow("PostgreSQL mode requires DATABASE_URL");
});
