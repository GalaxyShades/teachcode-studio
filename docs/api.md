# HTTP API

For student-app integration, start with the [lesson content API guide](lesson-content-api.md) and [OpenAPI specification](content-api.openapi.json).

The UI calls parent groups **lessons** and content documents **chapters**. Internal authoring API paths and response keys use `modules` for those groups and `lessons` for chapters. The public v1 content API uses lesson/chapter terminology. API path parameters use internal IDs, while UI links use readable slugs.

Authoring endpoints under `/api/courses` require an admin or assigned-staff session. The public API lists published courses, retrieves their lesson/chapter outlines, and serves individual published chapters. Studio does not currently provide API-key or service-account authentication.

All authenticated endpoints use the HTTP-only `teachcode_cms_session` cookie. Login rotates the current browser session; logout revokes the database token. Sessions expire after seven days. Cookies use SameSite=Lax and Secure in production. Only admin/staff roles receive CMS sessions. All mutations check authorization on the server, and cross-origin mutation requests are rejected.

Authoring bodies are JSON and validated with Zod. Authoring errors return `{ "error": "message" }`, optionally `issues` for validation. Statuses: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 version/uniqueness/order conflict, 500 unexpected server/setup error. No endpoint executes learner code on the server.

| Method        | Path                                                  | Behavior / role                                                                       |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST          | /api/auth/login                                       | `{email,password}`; establish session                                                 |
| GET           | /api/auth/session                                     | `{user: User or null}`                                                                |
| DELETE        | /api/auth/session                                     | Revoke session and clear cookie                                                       |
| GET           | /api/courses                                          | Admin: all; staff: assigned only                                                      |
| POST          | /api/courses                                          | Admin; `{title,slug,description}`                                                     |
| GET           | /api/courses/:courseId                                | Course, modules, lessons, assigned staff (admin only), user                           |
| PATCH         | /api/courses/:courseId                                | Admin; `{title,slug,description,status}`                                              |
| GET           | /api/courses/:courseId/modules                        | Ordered modules                                                                       |
| POST          | /api/courses/:courseId/modules                        | Admin; `{title}` creates, `{id,title}` renames                                        |
| DELETE        | /api/courses/:courseId/modules                        | Admin; `{id}`; module must be empty                                                   |
| GET           | /api/courses/:courseId/lessons                        | Ordered lessons                                                                       |
| POST          | /api/courses/:courseId/lessons                        | Admin; creates an empty draft                                                         |
| PATCH         | /api/courses/:courseId/lessons/:lessonId              | Admin; `{moduleId: string or null}`                                                   |
| DELETE        | /api/courses/:courseId/lessons/:lessonId              | Admin; archives and unpublishes                                                       |
| GET           | /api/courses/:courseId/lessons/:lessonId/draft        | Assigned staff/admin; `{lesson,draft}`                                                |
| PUT           | /api/courses/:courseId/lessons/:lessonId/draft        | Assigned staff/admin; complete LessonDraft including current version                  |
| POST          | /api/courses/:courseId/lessons/:lessonId/publish      | Admin; complete LessonDraft including current version; validate/save/clone atomically |
| DELETE        | /api/courses/:courseId/lessons/:lessonId/publish      | Admin; unpublish                                                                      |
| PUT           | /api/courses/:courseId/reorder                        | Admin; `{kind: "modules" or "lessons", ids: [...]}`; every course item exactly once   |
| GET           | /api/courses/:courseId/assignments                    | Admin; assigned staff                                                                 |
| PUT           | /api/courses/:courseId/assignments                    | Admin; `{userId,assigned: boolean}`                                                   |
| GET           | /api/users?q=...                                      | Admin; up to 50 matching staff names/emails                                           |
| GET / OPTIONS | /api/v1/content/courses/:courseId/chapters/:chapterId | Public selected published revision                                                    |

`LessonDraft` is defined in `lib/content.ts`; its discriminated block schemas are the same schemas used by import, editor and repositories. Save and publish return `{ok,version,errors,savedAt,editor}`; publish also returns `revisionId`. Resend only after adopting the returned version. A conflict needs a fresh GET and user review; never silently overwrite it.

Public content includes ordered steps and visible learner blocks. It omits the mutable draft version counter, source Markdown, solution/check scripts, private review rubrics, tutor constraints and code-review configuration. MCQ correctness remains client-visible for interactive demo feedback and is not secure assessment grading. No author check can remain secret if shipped to a learner browser, so hidden checks run only in authenticated author preview until a dedicated sandbox service is integrated.

Public API responses are `Cache-Control: no-store`; Studio public pages render dynamically. Publishing/unpublishing also revalidates the public layout. Exact origins listed in `ALLOWED_CORS_ORIGINS` receive read-only CORS headers with `Vary: Origin`. Other origins receive no CORS permission. This does not restrict direct access to public content.

The learner page resolves `/published/courses/:courseSlug/lessons/:publishedLessonSlug` using the selected revision’s slug. Updating a draft slug does not change the published URL until the next publication. Existing student-app integration is separately scoped.

## Published content for the student app

Studio owns authoring, content validation, publication, and content delivery. The student app owns student authentication, enrolment, attempts, completion rules, scores, progress, and analytics. Studio's public player only keeps temporary UI state; its step-position indicator is not a completion record. It does not write student progress.

1. `GET /api/v1/content/courses` lists published courses with at least one published chapter.
2. `GET /api/v1/content/courses/:courseId` returns course details and ordered `lessons`, each containing `chapters`; chapters without a lesson appear in `unassignedChapters`. Draft/archived chapters and empty lesson groups are excluded.
3. Follow a chapter's `contentUrl`, or request `GET /api/v1/content/courses/:courseId/chapters/:chapterId`, to fetch its public content.

Chapter metadata comes from the published snapshot, so draft title/slug changes do not appear in this catalogue. Course/lesson names and ordering are live course structure. All these reads support the configured CORS allowlist and use `Cache-Control: no-store`.

Each chapter includes `courseId`, `chapterId`, and `revisionId` alongside its content. The student app should store progress against its own student ID plus the stable chapter/step/card IDs, and record `revisionId` with attempts. A changed revision signals republishing; the student app decides whether completion remains valid. Titles and slugs are display labels, not progress keys. Studio retains five published versions; the student app must retain any historical assessment records it needs. The public API serves the current publication only, not arbitrary old revisions.

These content endpoints are public, not enrolment-gated, and do not provide secure grading. Student-only content access or server-side grading would need a separately designed authenticated integration. Correct answers for demo MCQs are client-visible; private author checks are omitted.

## Course outline

`PUT /api/courses/:courseId/outline` saves the full lesson/chapter outline as one
admin-only transaction. The body is `{ "lessons": ["group-id"], "chapters": [{ "id": "chapter-id", "lessonId": "group-id" }] }`.
Use `null` for a chapter without a lesson. Every current group and chapter must
appear exactly once; stale, duplicate, or foreign IDs return 409 without partial
changes. Existing `/modules` endpoints manage the lesson groups, and `/lessons`
endpoints manage chapters. `POST /lessons` also accepts an optional `moduleId` and `title` to
create a named chapter directly inside the chosen lesson. Titles are trimmed and must contain 1–200 characters when supplied.

## Version history

`GET /api/courses/:courseId/lessons/:lessonId/history` lists up to five recent published snapshots and the current published revision ID. Assigned staff and admins may read history.

`POST` to the same path with `{ "revisionId": "...", "version": 3 }` restores a retained publication into the current draft. It requires chapter editing access, rejects stale versions with 409 and unavailable snapshots with 404, and returns the saved draft and new version. Publication and archive status remain unchanged. Publishing prunes snapshots beyond the five most recent, including their normalized content.
