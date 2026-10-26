import { loadEnvConfig } from "@next/env";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db, assertDatabase, isSqlite } from "../lib/db";

const migrationDir = () =>
  isSqlite() ? "db/sqlite-migrations" : "db/migrations";

async function unappliedMigrationNames(): Promise<string[]> {
  const names = (await readdir(migrationDir()))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let applied = new Set<string>();
  try {
    const rows = await db().query<{ name: string }>(
      "SELECT name FROM cms_schema_migrations",
    );
    applied = new Set(rows.rows.map((row) => row.name));
  } catch (error) {
    const missing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42P01";
    if (!missing) throw error;
  }
  return names.filter((name) => !applied.has(name));
}

/** Dump Postgres before changing it. Tests call migrate() directly and skip this. */
async function backupBeforeMigrate(): Promise<void> {
  if (isSqlite()) return;
  const pending = await unappliedMigrationNames();
  if (!pending.length) {
    console.log("[migrate] no pending migrations; backup skipped");
    await db().end();
    return;
  }
  console.log(
    `[migrate] backing up the current database before ${pending.join(", ")}`,
  );
  await db().end();
  const script = fileURLToPath(new URL("./backup.sh", import.meta.url));
  const result = spawnSync("bash", [script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(
      "[migrate] backup failed. Migrations were not applied.",
    );
    process.exit(result.status ?? 1);
  }
}

export async function migrate() {
  if (!isSqlite()) await assertDatabase(true);
  await db().query(
    "CREATE TABLE IF NOT EXISTS cms_schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at text NOT NULL)",
  );
  const dir = migrationDir();
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`${dir}/${name}`, "utf8"),
      checksum = createHash("sha256").update(sql).digest("hex");
    const existing = (
      await db().query(
        "SELECT checksum FROM cms_schema_migrations WHERE name=$1",
        [name],
      )
    ).rows[0];
    if (existing) {
      if (existing.checksum !== checksum)
        throw new Error(
          `Migration ${name} changed after application; restore it and add a new migration.`,
        );
      continue;
    }
    await db().transaction(async (c) => {
      // Migration files contain SQL only; PostgreSQL DO blocks need a whole statement.
      if (isSqlite()) {
        for (const statement of sql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean))
          await c.query(statement);
      } else await c.query(sql);
      await c.query(
        "INSERT INTO cms_schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)",
        [name, checksum, new Date().toISOString()],
      );
    });
    console.log(`Applied ${name}`);
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  loadEnvConfig(process.cwd());
  backupBeforeMigrate()
    .then(() => migrate())
    .then(() => db().end())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
