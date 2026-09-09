import { loadEnvConfig } from "@next/env";
import { db, assertDatabase, isSqlite } from "../lib/db";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function migrate() {
  if (!isSqlite()) await assertDatabase(true);
  await db().query(
    "CREATE TABLE IF NOT EXISTS cms_schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at text NOT NULL)",
  );
  const dir = isSqlite() ? "db/sqlite-migrations" : "db/migrations";
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
  migrate()
    .then(() => db().end())
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
