# TeachCode Content Studio

A standalone course authoring app. **SQLite is an isolated local demo**, never the shared TeachCode database. PostgreSQL is the shared deployment target. Publishing updates this Studio’s public learner route and published-content API immediately. Integration with the legacy TeachCode student app is a separate follow-up. YAML migration is out of scope.

## Local setup

Requires Node.js 22.13 or newer (Node 22 is used in CI).

```sh
npm install
cp .env.example .env.local
npm run db:init:sqlite
npm run dev
```

Open http://localhost:3000/login. Local-only accounts all use `password`:

| Account             | Access                                           |
| ------------------- | ------------------------------------------------ |
| admin@hku.hk        | All courses, structure, assignments, publication |
| python.staff@hku.hk | Python course drafts                             |
| r.staff@hku.hk      | R course drafts                                  |

Never provision these credentials in a shared environment. Seeding is restricted to SQLite. Initialization is repeatable and does not overwrite migrated lesson data. A pre-migration scaffold database is preserved as a `.legacy-*.bak` file before a new database is initialized.

## Authoring

Open a course and lesson, or create one as admin. Edit metadata, steps and typed cards in Rich Editor. Use **Import Markdown** or paste into the Markdown tab. Invalid source stays visible and is saved alongside the last valid model; publication is blocked until it is fixed. Rich Editor shows one step at a time with compact cards. Click **Edit** to open a card, drag its surface to reorder, or use the card menu’s keyboard-accessible move actions. Add a **Markdown text** card for formatted prose; other cards use focused fields. Preview is optional. Raw HTML is not rendered.

Use [component-reference.md](content/component-reference.md) as your **Markdown syntax reference**, then write and import your own Python lessons. This sample is not the original Python Launchpad source. The local seed contains a reference lesson demonstrating all eleven components.

Draft changes autosave after a one-second debounce. Explicit Save Draft is also available. Version checks reject stale writers. Publishing creates a separate immutable revision and marks the course published. Later draft edits, including slug changes, leave the published snapshot and its URL intact. Unpublishing a course hides its lessons; archiving or unpublishing a lesson removes public access.

## Verification

```sh
npm run lint
npm run typecheck
npm test
TEST_POSTGRES=1 npm test
npm run build
npx playwright install chromium
npm run test:e2e
TEST_RUNTIMES=1 npm run test:e2e
```

SQLite and browser tests use disposable databases. `TEST_POSTGRES=1` starts a disposable real PostgreSQL cluster with fixture identity tables; it does not connect to the shared database. Runtime smoke tests are opt-in because they download Python/R browser runtimes from public CDNs. CI runs lint, typecheck, unit/database tests, build and browser/API smoke tests.

## Guides

- [Database setup, migrations and rollback](docs/database.md)
- [Markdown dialect and nested fields](docs/markdown.md)
- [API and authentication](docs/api.md)
- [Architecture and schema](docs/architecture.md)
- [Execution security and deployment follow-ups](docs/security.md)

The implemented demo includes normalized storage, editor forms, Markdown round trips, autosave, immutable publication, permissions, assignment search, course/module management, ordering, shared learner rendering, and browser worker execution. The deployment-specific and runtime limitations are documented separately; this is not a claim that the shared TeachCode production environment has been verified.
