import { Pool } from "pg";
import type { SQLInputValue } from "node:sqlite";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
import { existsSync } from "node:fs";
export type Row = Record<string, any>;
export type QueryResult<T = Row> = { rows: T[]; rowCount: number };
export type Queryable = {
  query: <T = Row>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
};
export type Database = Queryable & {
  transaction: <T>(work: (client: Queryable) => Promise<T>) => Promise<T>;
  end: () => Promise<void>;
};
let singleton: Database | undefined;
export const isSqlite = () =>
  (process.env.DATABASE_MODE || "sqlite") === "sqlite";
export const arrayValue = (v: unknown[]) =>
  isSqlite() ? JSON.stringify(v) : v;
export const arrayRead = (v: any): any[] =>
  Array.isArray(v) ? v : JSON.parse(v || "[]");
function localSqlite(): Database {
  const path =
    process.env.SQLITE_DATABASE_PATH ||
    "./data/teachcode-content-studio.local.db";
  if (!existsSync(path))
    throw new Error("Local SQLite file missing. Run npm run db:init:sqlite.");
  const raw = new DatabaseSync(path);
  raw.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000",
  );
  const query: Queryable["query"] = async <T = Row>(
    sql: string,
    params: unknown[] = [],
  ) => {
    const values: SQLInputValue[] = [];
    const q = sql.replace(/\$(\d+)/g, (_, n) => {
      const v = params[Number(n) - 1];
      values.push(
        (typeof v === "boolean" ? Number(v) : (v ?? null)) as SQLInputValue,
      );
      return "?";
    });
    const stmt = raw.prepare(q);
    if (stmt.columns().length) {
      const rows = stmt.all(...values).map((row) => ({ ...row })) as T[];
      return { rows, rowCount: rows.length };
    }
    const result = stmt.run(...values);
    return { rows: [], rowCount: Number(result.changes) };
  };
  // Serialize all connection users, including reads, so no request sees uncommitted data.
  let tail = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  return {
    query: (sql, p) => exclusive(() => query(sql, p)),
    transaction: (work) =>
      exclusive(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const value = await work({ query });
          raw.exec("COMMIT");
          return value;
        } catch (e) {
          raw.exec("ROLLBACK");
          throw e;
        }
      }),
    async end() {
      await tail;
      raw.close();
      singleton = undefined;
    },
  };
}
export function db(): Database {
  if (singleton) return singleton;
  if (isSqlite()) return (singleton = localSqlite());
  if (process.env.DATABASE_MODE !== "postgres")
    throw new Error("DATABASE_MODE must be sqlite or postgres.");
  if (!process.env.DATABASE_URL)
    throw new Error(
      "PostgreSQL mode requires DATABASE_URL. Configure the shared TeachCode deployment first.",
    );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const query: Queryable["query"] = async (sql, p) => {
    const r = await pool.query(sql, p);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  };
  return (singleton = {
    query,
    transaction: async (work) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await work({
          query: async (sql, p) => {
            const r = await client.query(sql, p);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
        });
        await client.query("COMMIT");
        return value;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async end() {
      await pool.end();
      singleton = undefined;
    },
  });
}
export async function assertDatabase(identityOnly = false) {
  if (isSqlite()) {
    for (const table of [
      "profiles",
      "auth_sessions",
      ...(identityOnly
        ? []
        : ["cms_schema_migrations", "cms_code_exercise_blocks"]),
    ]) {
      if (
        !(
          await db().query(
            "select name from sqlite_master where type='table' and name=$1",
            [table],
          )
        ).rowCount
      )
        throw new Error(
          "Local SQLite schema is incomplete. Run npm run db:init:sqlite.",
        );
    }
  } else {
    const r = await db().query(
      "select to_regclass('public.profiles') profile, to_regclass('public.auth_sessions') session",
    );
    if (!r.rows[0]?.profile || !r.rows[0]?.session)
      throw new Error(
        "Shared PostgreSQL tables profiles and auth_sessions are required; provision TeachCode identity before CMS migrations.",
      );
    const cols = (
      await db().query(
        "select column_name from information_schema.columns where table_schema='public' and table_name='auth_sessions'",
      )
    ).rows.map((r) => r.column_name);
    if (
      ["token", "user_id", "created_at", "expires_at"].some(
        (c) => !cols.includes(c),
      )
    )
      throw new Error(
        "Shared auth_sessions requires token, user_id, created_at, expires_at. Configure the identity adapter to match the actual schema.",
      );
    if (
      !identityOnly &&
      !(
        await db().query(
          "select to_regclass('public.cms_schema_migrations') present",
        )
      ).rows[0].present
    )
      throw new Error("CMS tables missing. Run npm run db:migrate.");
  }
}

/** A coherent read across publication/outline changes without locking PostgreSQL writers. */
export function readSnapshot<T>(read: (client: Queryable) => Promise<T>) {
  return db().transaction(async (client) => {
    if (!isSqlite())
      await client.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
    return read(client);
  });
}
