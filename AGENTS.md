# TeachCode Content Studio — agent map

Standalone course authoring app. It is not the TeachCode student app.

- **Web**: Next.js 15 App Router at `app/`. Editor and learner UI in `components/`. Schema, repository, auth, and the public content contract in `lib/`.
- **Authoring**: `/courses` (staff session). Public learner HTML: `/published/courses/:courseSlug/lessons/:lessonSlug`.
- **Student-app read API**: `GET /api/v1/content/courses`, `.../courses/:courseId`, `.../lessons/:lessonId`. The student app must not call `/api/courses`.
- **Database**: SQLite is an isolated local demo. PostgreSQL is the deployment target and must not create or alter shared `profiles` / `auth_sessions`.
- **Docs**: `docs/architecture.md`, `docs/lesson-content-api.md`, `docs/api.md`, `docs/database.md`, `docs/security.md`, `docs/markdown.md`.
- **Cursor rules**: `.cursor/rules/*.mdc`.

Studio owns content. The student app owns identity, enrollment, attempts, completion, scores, and progress.

**Before finishing changes:** `npm run typecheck` → `npm run lint` → `npm test` when behavior changed. Do **not** run `npm run build` or `./scripts/build-and-host.sh`. The human runs `./scripts/build-and-host.sh` to host Studio. Dev: `npm run dev` on port **3000**.
