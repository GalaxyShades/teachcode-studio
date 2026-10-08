# HTTP API

For student-app integration, start with the [lesson content API guide](lesson-content-api.md) and [OpenAPI specification](content-api.openapi.json).

Studio content is Course → Chapter → Lesson. A chapter groups lessons. A lesson is the editable document. API path parameters use internal IDs, while UI links use readable slugs.

This app is the only place lessons are created and edited. The other app only reads. It must not get authoring write endpoints, and this app does not store student progress, attempts, completion, or scores. The other app stores progress against its own student id plus the stable ids this API returns (course, chapter, lesson, revision, step, component). A new revisionId means the lesson was republished; the other app decides whether old progress still counts.

Authoring endpoints under `/api/courses` require an admin or assigned-staff session. The public read API is unauthenticated: there is no API key or service-account login. It lists published courses, returns each course's ordered chapters and lessons, and serves one published lesson. Solutions, automated checks, additional penalties, ignored issues, assistant settings, source Markdown, and drafts stay off that payload. Returning them on an unauthenticated endpoint would leak them to every client. A future authenticated read would be required before the other app can apply hidden checks or review lists. That read is not part of this API. Shapes and id rules are in the [lesson content API guide](lesson-content-api.md).

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

Public content includes ordered steps and learner-visible components. A code exercise’s learner text is `instructions`. The response omits the mutable draft version counter, source Markdown, solutions, automated check scripts, `additionalPenalties`, `ignoredIssues`, reflection rubrics, and both Learning Assistant configurations (`suggestedQuestions` and `constraints`). MCQ `correct` flags and explanations stay on the payload for immediate demo feedback. They are not secure assessment grading. Hidden checks run only in authenticated author preview. They are not on this public API, because a secret sent to a browser is no longer a secret.

Public API responses are `Cache-Control: no-store`; Studio public pages render dynamically. Publishing/unpublishing also revalidates the public layout. Exact origins listed in `ALLOWED_CORS_ORIGINS` receive read-only CORS headers with `Vary: Origin`. Other origins receive no CORS permission. This does not restrict direct access to public content.

The learner page resolves `/published/courses/:courseSlug/lessons/:publishedLessonSlug` using the selected revision’s slug. Updating a draft slug does not change the published URL until the next publication. The other app should call the public content API, not that HTML route, and not the authoring routes above.

## Published content for the student app

This app is the only place lessons are created and edited. The other app only reads. It must not get authoring write endpoints, and this app does not store student progress, attempts, completion, or scores. The other app stores progress against its own student id plus the stable ids this API returns (course, chapter, lesson, revision, step, component). A new revisionId means the lesson was republished; the other app decides whether old progress still counts.

1. `GET /api/v1/content/courses` lists published courses that have at least one published lesson: `{id, slug, title, description}`.
2. `GET /api/v1/content/courses/:courseId` returns the course plus ordered `chapters`. Each chapter is `{id, title, lessons}`. Each lesson summary is `{id, chapterId, slug, title, description, revisionId, contentUrl}`. Lessons with no chapter are in `unassignedLessons`, with `chapterId: null`. Drafts, archived lessons, and empty chapters are left out.
3. `GET /api/v1/content/courses/:courseId/lessons/:lessonId`, or the lesson's `contentUrl`, returns the current published lesson: steps, learner-visible components, and `revisionId`.

Lesson title, slug, description, and components come from the published snapshot. Course title, chapter title, chapter membership, and order come from the live course structure. Array order is the navigation order. These reads use the configured CORS allowlist and `Cache-Control: no-store`.

Titles and slugs are labels, not progress keys. Studio keeps five published snapshots for staff restore. The public API serves only the current publication. The other app keeps any older progress or assessment records it still needs.

These reads are public. They are not enrolment checks and they do not grade. A future authenticated read would be required before the other app can apply hidden checks or review lists. Do not add that read by calling the staff draft or publish routes.

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
