# HTTP API

All authenticated endpoints use the HTTP-only `teachcode_cms_session` cookie. Login rotates the current browser session; logout revokes the database token. Sessions expire after seven days. Cookies use SameSite=Lax and Secure in production. Only admin/staff roles receive CMS sessions. All mutations check authorization on the server, and cross-origin mutation requests are rejected.

Bodies are JSON and validated with Zod. Errors return `{ "error": "message" }`, optionally `issues` for validation. Statuses: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 version/uniqueness/order conflict, 500 unexpected server/setup error. No endpoint executes learner code on the server.

| Method        | Path                                               | Behavior / role                                                                       |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST          | /api/auth/login                                    | `{email,password}`; establish session                                                 |
| GET           | /api/auth/session                                  | `{user: User or null}`                                                                |
| DELETE        | /api/auth/session                                  | Revoke session and clear cookie                                                       |
| GET           | /api/courses                                       | Admin: all; staff: assigned only                                                      |
| POST          | /api/courses                                       | Admin; `{title,slug,description}`                                                     |
| GET           | /api/courses/:courseId                             | Course, modules, lessons, assigned staff (admin only), user                           |
| PATCH         | /api/courses/:courseId                             | Admin; `{title,slug,description,status}`                                              |
| GET           | /api/courses/:courseId/modules                     | Ordered modules                                                                       |
| POST          | /api/courses/:courseId/modules                     | Admin; `{title}` creates, `{id,title}` renames                                        |
| DELETE        | /api/courses/:courseId/modules                     | Admin; `{id}`; module must be empty                                                   |
| GET           | /api/courses/:courseId/lessons                     | Ordered lessons                                                                       |
| POST          | /api/courses/:courseId/lessons                     | Admin; creates an empty draft                                                         |
| PATCH         | /api/courses/:courseId/lessons/:lessonId           | Admin; `{moduleId: string or null}`                                                   |
| DELETE        | /api/courses/:courseId/lessons/:lessonId           | Admin; archives and unpublishes                                                       |
| GET           | /api/courses/:courseId/lessons/:lessonId/draft     | Assigned staff/admin; `{lesson,draft}`                                                |
| PUT           | /api/courses/:courseId/lessons/:lessonId/draft     | Assigned staff/admin; complete LessonDraft including current version                  |
| POST          | /api/courses/:courseId/lessons/:lessonId/publish   | Admin; complete LessonDraft including current version; validate/save/clone atomically |
| DELETE        | /api/courses/:courseId/lessons/:lessonId/publish   | Admin; unpublish                                                                      |
| PUT           | /api/courses/:courseId/reorder                     | Admin; `{kind: "modules" or "lessons", ids: [...]}`; every course item exactly once   |
| GET           | /api/courses/:courseId/assignments                 | Admin; assigned staff                                                                 |
| PUT           | /api/courses/:courseId/assignments                 | Admin; `{userId,assigned: boolean}`                                                   |
| GET           | /api/users?q=...                                   | Admin; up to 50 matching staff names/emails                                           |
| GET / OPTIONS | /api/published/courses/:courseId/lessons/:lessonId | Public selected published revision                                                    |

`LessonDraft` is defined in `lib/content.ts`; its discriminated block schemas are the same schemas used by import, editor and repositories. Save and publish return `{ok,version,errors,savedAt,editor}`; publish also returns `revisionId`. Resend only after adopting the returned version. A conflict needs a fresh GET and user review; never silently overwrite it.

Public content includes ordered steps and visible learner blocks. It omits the mutable draft version counter, source Markdown, solution/check scripts, private review rubrics, tutor constraints and code-review configuration. MCQ correctness remains client-visible for interactive demo feedback and is not secure assessment grading. No author check can remain secret if shipped to a learner browser, so hidden checks run only in authenticated author preview until a dedicated sandbox service is integrated.

Public API responses are `Cache-Control: no-store`; Studio public pages render dynamically. Publishing/unpublishing also revalidates the public layout. Exact origins listed in `ALLOWED_CORS_ORIGINS` receive read-only CORS headers with `Vary: Origin`. Other origins receive no CORS permission. This does not restrict direct access to public content.

The learner page resolves `/published/courses/:courseSlug/lessons/:publishedLessonSlug` using the selected revision’s slug. Updating a draft slug does not change the published URL until the next publication. Existing student-app integration is separately scoped.

## Course outline

`PUT /api/courses/:courseId/outline` saves the full lesson/chapter outline as one
admin-only transaction. The body is `{ "lessons": ["group-id"], "chapters": [{ "id": "chapter-id", "lessonId": "group-id" }] }`.
Use `null` for a chapter without a lesson. Every current group and chapter must
appear exactly once; stale, duplicate, or foreign IDs return 409 without partial
changes. Existing `/modules` endpoints manage the lesson groups, and `/lessons`
endpoints manage chapters. `POST /lessons` also accepts an optional `moduleId` to
create a chapter directly inside the chosen lesson.
