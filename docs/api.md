# HTTP API

For student-app integration, start with the [lesson content API guide](lesson-content-api.md) and [OpenAPI specification](content-api.openapi.json).

Studio content is Course → Chapter → Lesson. A chapter groups lessons. A lesson is the editable document. API path parameters use internal IDs, while UI links use readable slugs.

Authoring endpoints under `/api/courses` require an admin or assigned-staff session. The public API lists published courses, retrieves their chapter/lesson outlines, and serves individual published lessons. Studio does not currently provide API-key or service-account authentication. Learning Assistant settings, source Markdown, solutions, check scripts, rubrics, additional penalties, and ignored issues are authoring data and are omitted from public responses.

All authenticated endpoints use the HTTP-only `teachcode_cms_session` cookie. Login rotates the current browser session; logout revokes the database token. Sessions expire after seven days. Cookies use SameSite=Lax and Secure in production. Only admin/staff roles receive CMS sessions. All mutations check authorization on the server, and cross-origin mutation requests are rejected.

Authoring bodies are JSON and validated with Zod. Authoring errors return `{ "error": "message" }`, optionally `issues` for validation. Statuses: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 version/uniqueness/order conflict, 500 unexpected server/setup error. No endpoint executes learner code on the server.

| Method | Path                                             | Behavior / role                                                                      |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| POST   | /api/auth/login                                  | `{email,password}`; establish session                                                |
| GET    | /api/auth/session                                | `{user: User or null}`                                                               |
| DELETE | /api/auth/session                                | Revoke session and clear cookie                                                      |
| GET    | /api/courses                                     | Admin: all; staff: assigned only                                                     |
| POST   | /api/courses                                     | Admin; `{title,slug,description}`                                                    |
| GET    | /api/courses/:courseId                           | Course, chapters, lessons, assigned staff (admin only), user                         |
| PATCH  | /api/courses/:courseId                           | Admin; `{title,slug,description,status}`                                             |
| GET    | /api/courses/:courseId/chapters                  | Ordered chapters                                                                     |
| POST   | /api/courses/:courseId/chapters                  | Admin; `{title}` creates, `{id,title}` renames                                       |
| DELETE | /api/courses/:courseId/chapters                  | Admin; `{id}`; chapter must be empty                                                 |
| GET    | /api/courses/:courseId/lessons                   | Ordered lessons                                                                      |
| POST   | /api/courses/:courseId/lessons                   | Admin; creates an empty draft                                                        |
| PATCH  | /api/courses/:courseId/lessons/:lessonId         | Admin; `{chapterId: string or null}`                                                 |
| DELETE | /api/courses/:courseId/lessons/:lessonId         | Admin; archives and unpublishes                                                      |
| GET    | /api/courses/:courseId/lessons/:lessonId/draft   | Assigned staff/admin; `{lesson,draft,courseAssistant,lessonAssistant}`               |
| PUT    | /api/courses/:courseId/lessons/:lessonId/draft   | Assigned staff/admin; LessonDraft plus optional assistant settings and version       |
| POST   | /api/courses/:courseId/lessons/:lessonId/publish | Admin; LessonDraft plus optional assistant settings; validate/save/clone atomically  |
| DELETE | /api/courses/:courseId/lessons/:lessonId/publish | Admin; unpublish                                                                     |
| PUT    | /api/courses/:courseId/reorder                   | Admin; `{kind: "chapters" or "lessons", ids: [...]}`; every course item exactly once |
| GET    | /api/courses/:courseId/assignments               | Admin; assigned staff                                                                |
| PUT           | /api/courses/:courseId/outline                        | Admin; full chapter and lesson order in one transaction                             |
| GET           | /api/courses/:courseId/lessons/:lessonId/history      | Assigned staff/admin; up to five published snapshots                                 |
| POST          | /api/courses/:courseId/lessons/:lessonId/history      | Assigned staff/admin; restore a snapshot into the current draft                     |
| PUT           | /api/courses/:courseId/assignments                    | Admin; `{userId,assigned: boolean}`                                                  |
| GET           | /api/users?q=...                                      | Admin; up to 50 matching staff names/emails                                          |
| GET / OPTIONS | /api/v1/content/courses                               | Public courses that have a published lesson                                          |
| GET / OPTIONS | /api/v1/content/courses/:courseId                     | Public course, ordered chapters, and unassigned lessons                              |
| GET / OPTIONS | /api/v1/content/courses/:courseId/lessons/:lessonId   | Public selected published revision                                                   |

Admins assign and unassign staff at `/courses/:courseSlug/assignments`. Assigned staff can edit drafts for those courses and do not receive that page.

`LessonDraft` is defined in `lib/content.ts`; its discriminated block schemas are the same schemas used by import, editor and repositories. Save and publish return `{ok,version,errors,savedAt,editor}`; publish also returns `revisionId`. Resend only after adopting the returned version. A conflict needs a fresh GET and user review; never silently overwrite it.

Public content includes ordered steps and visible learner blocks. A code exercise’s learner text is `instructions`. The response omits the mutable draft version counter, source Markdown, solutions, check scripts, `additionalPenalties`, `ignoredIssues`, reflection rubrics, and both Learning Assistant configurations (`suggestedQuestions` and `constraints`). MCQ correctness remains client-visible for interactive demo feedback and is not secure assessment grading. No author check can remain secret if shipped to a learner browser, so hidden checks run only in authenticated author preview until a dedicated sandbox service is integrated.

Public API responses are `Cache-Control: no-store`; Studio public pages render dynamically. Publishing/unpublishing also revalidates the public layout. Exact origins listed in `ALLOWED_CORS_ORIGINS` receive read-only CORS headers with `Vary: Origin`. Other origins receive no CORS permission. This does not restrict direct access to public content.

The learner page resolves `/published/courses/:courseSlug/lessons/:publishedLessonSlug` using the selected revision’s slug. Updating a draft slug does not change the published URL until the next publication. Existing student-app integration is separately scoped.

## Published content for the student app

Studio owns authoring, content validation, publication, and content delivery. The student app owns student authentication, enrolment, attempts, completion rules, scores, progress, and analytics. Studio's public player only keeps temporary UI state; its step-position indicator is not a completion record. It does not write student progress.

1. `GET /api/v1/content/courses` lists published courses with at least one published lesson.
2. `GET /api/v1/content/courses/:courseId` returns course details and ordered `chapters`, each containing `lessons`; lessons without a chapter appear in `unassignedLessons`. Draft/archived lessons and empty chapters are excluded.
3. Follow a lesson's `contentUrl`, or request `GET /api/v1/content/courses/:courseId/lessons/:lessonId`, to fetch its public content.

Lesson metadata comes from the published snapshot, so draft title/slug changes do not appear in this catalogue. Course and chapter names and ordering are live course structure. All these reads support the configured CORS allowlist and use `Cache-Control: no-store`.

Each lesson includes `courseId`, `lessonId`, and `revisionId` alongside its content. The student app should store progress against its own student ID plus the stable lesson/step/card IDs, and record `revisionId` with attempts. A changed revision signals republishing; the student app decides whether completion remains valid. Titles and slugs are display labels, not progress keys. Studio retains five published versions; the student app must retain any historical assessment records it needs. The public API serves the current publication only, not arbitrary old revisions.

These content endpoints are public, not enrolment-gated, and do not provide secure grading. Student-only content access or server-side grading would need a separately designed authenticated integration. Correct answers for demo MCQs are client-visible; private author checks are omitted.

## Course outline

`PUT /api/courses/:courseId/outline` saves the full chapter/lesson outline as one
admin-only transaction. The body is `{ "chapters": ["chapter-id"], "lessons": [{ "id": "lesson-id", "chapterId": "chapter-id" }] }`.
Use `null` for a lesson without a chapter. Every current chapter and lesson must
appear exactly once; stale, duplicate, or foreign IDs return 409 without partial
changes. `/chapters` endpoints manage chapter groups, and `/lessons`
endpoints manage lesson documents. `POST /lessons` also accepts an optional `chapterId` and `title` to
create a named lesson directly inside the chosen chapter. Titles are trimmed and must contain 1–200 characters when supplied.

Saving a lesson draft can include `lessonAssistant` and `courseAssistant`. Each object has `suggestedQuestions` (one question per line) and `constraints`. Lesson settings are stored with that revision and copied into the published snapshot. Course settings are stored once on the course and apply to every lesson. Both stay off the public content API. There is no connected tutor service.

## Version history

`GET /api/courses/:courseId/lessons/:lessonId/history` lists up to five recent published snapshots and the current published revision ID. Assigned staff and admins may read history.

`POST` to the same path with `{ "revisionId": "...", "version": 3 }` restores a retained publication into the current draft, including that snapshot's lesson Learning Assistant settings. It requires lesson editing access, rejects stale versions with 409 and unavailable snapshots with 404, and returns the saved draft and new version. Publication and archive status remain unchanged. Publishing prunes snapshots beyond the five most recent, including their normalized content.
