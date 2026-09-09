import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
import { mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
const databasePath = resolve(
  process.env.SQLITE_DATABASE_PATH ||
    "./data/teachcode-content-studio.local.db",
);
if (process.env.DATABASE_MODE && process.env.DATABASE_MODE !== "sqlite")
  throw new Error(
    "SQLite initialization is only available in isolated local mode.",
  );
mkdirSync(dirname(databasePath), { recursive: true });
if (existsSync(databasePath)) {
  const old = new DatabaseSync(databasePath);
  const tracked = old
    .prepare(
      "select name from sqlite_master where name='cms_schema_migrations'",
    )
    .get();
  old.close();
  if (!tracked) {
    const backup = databasePath + `.legacy-${Date.now()}.bak`;
    renameSync(databasePath, backup);
    console.log(`Preserved pre-migration scaffold database at ${backup}`);
  }
}
const raw = new DatabaseSync(databasePath);
raw.close();
for (const script of ["scripts/migrate.ts", "scripts/seed.ts"]) {
  const r = spawnSync(process.execPath, ["--import", "tsx", script], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_MODE: "sqlite",
      SQLITE_DATABASE_PATH: databasePath,
    },
  });
  if (r.status) process.exit(r.status);
}
