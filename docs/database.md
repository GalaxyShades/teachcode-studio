# Database modes and migrations

## Isolated SQLite demo

`DATABASE_MODE` defaults to `sqlite`; `SQLITE_DATABASE_PATH` defaults to `./data/teachcode-content-studio.local.db`. `npm run db:init:sqlite` initializes local identity fixtures, applies `db/sqlite-migrations/*.sql`, and seeds Python/R courses, two assigned staff, an admin and a reference lesson. Every supported component uses a typed detail table; source Markdown is retained as an authoring document, never as the storage replacement for blocks.

`npm run dev` and `npm start` validate startup. Missing files or incomplete local tables report `Run npm run db:init:sqlite`. No database is needed just to compile a build. The SQLite adapter binds positional parameters correctly, converts boolean bindings, uses foreign keys and WAL, and serializes transactions and reads on its connection. Multiple server workers use SQLite’s write lock with a five-second busy timeout.

Stop the dev server before `npm run db:reset:sqlite`. Reset preserves the database and any WAL/SHM files under timestamped `.reset-*.bak` names, then initializes a fresh demo. It never resets PostgreSQL. To restore, stop the app and restore a matching set of backed-up database/WAL/SHM files. Keep backups outside any public web directory.

## Shared PostgreSQL deployment

Copy `.env.production.example` to the deployment’s protected environment. Set `DATABASE_MODE=postgres`, `DATABASE_URL`, `APP_URL` and the student app’s exact `ALLOWED_CORS_ORIGINS`. The connection URL is server-only. Migrations require existing shared tables:

- `profiles`: `id`, `email`, `display_name`, `role`, `password_hash` for this password adapter.
- `auth_sessions`: `token`, **`user_id`**, `created_at`, `expires_at`.

The migration command checks these session columns and fails clearly for missing identity tables or `DATABASE_URL`. It never creates/changes shared identity tables, inserts shared demo users, or assumes `profile_id` in sessions. Course assignments intentionally retain their own `profile_id` foreign key. Inspect the provisioned identity schema and password format before enabling this adapter; replace `lib/auth.ts` for SSO if required.

```sh
npm run db:migrate
npm run build
npm start
```

CLI migrations load `.env.local` when run directly; environment variables supplied by deployment take precedence. Use a dedicated migration role, then run the app with only the data privileges it requires. Provision TLS and connection limits for the actual hosting environment.

## Migration strategy

Both modes record each migration name, SHA-256 checksum and application time in `cms_schema_migrations`. Never edit an applied migration: add a new numbered SQL file. Changed checksums cause a failure. Each file and its tracking entry commit together. PostgreSQL foreign-key creation is idempotent, and tests explicitly reapply the original schema to verify that constraints do not fail.

Run one migration process per deployment during a maintenance window. A disposable PostgreSQL test starts with fixture shared identity, applies/reapplies migrations, round-trips all detail types, clones published revisions and races versioned saves. This verifies the adapter against PostgreSQL; it cannot establish the schema or permissions of an unprovisioned shared TeachCode deployment.

## Backup and rollback

1. Stop CMS writes. Record the application release and current `cms_schema_migrations` rows.
2. Take a consistent full database backup using the deployment’s approved PostgreSQL backup mechanism (`pg_dump --format=custom` or a managed snapshot). Protect identity data and credentials in the backup.
3. Restore the backup into an isolated staging database and rehearse the migration there. Run adapter and application smoke tests.
4. Apply migrations once, start the new release, and verify sign-in, assigned courses, draft save and public publication.
5. If a migration fails, its transaction rolls back. Correct the deployment issue and retry. Do not delete tracking rows to bypass checksum errors.
6. If an already committed migration must be rolled back, keep writes stopped. Prefer a tested forward repair. Otherwise restore the pre-migration backup to a new database, validate it, and switch the app to that database with the previous release. Coordinate with the shared identity owner; blindly restoring a shared database can lose other applications’ writes.

No automatic destructive down migration is supplied. Recovery depends on a verified backup and the shared platform’s recovery objectives.
