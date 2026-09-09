import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
if (process.env.DATABASE_MODE && process.env.DATABASE_MODE !== "sqlite")
  throw new Error("Reset is restricted to isolated SQLite mode.");
const path = resolve(
  process.env.SQLITE_DATABASE_PATH ||
    "./data/teachcode-content-studio.local.db",
);
// Preserve the database and its WAL together. Stop the development server before reset.
const suffix = `.reset-${Date.now()}.bak`;
for (const ext of ["", "-wal", "-shm"])
  if (existsSync(path + ext)) renameSync(path + ext, path + ext + suffix);
await import("./init-local-sqlite.mjs");
