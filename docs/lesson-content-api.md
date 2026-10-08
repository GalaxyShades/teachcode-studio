# Lesson content API

Use this guide to render published courses and lessons in a separate student app. You do not need the Studio source. The machine-readable schema is [content-api.openapi.json](content-api.openapi.json). A copyable lesson body is [examples/published-lesson.json](examples/published-lesson.json).

## Who does what

- This app is the only place lessons are created and edited.
- The other app only reads. It must not get authoring write endpoints, and this app does not store student progress, attempts, completion, or scores.
- The other app stores progress against its own student id plus the stable ids this API returns (course, chapter, lesson, revision, step, component). A new revisionId means the lesson was republished; the other app decides whether old progress still counts.

Staff create and publish lessons in Studio. The student app never calls `/api/courses` or any other authoring route. Those routes require a staff session and can change content.

## Base URL

```text
{STUDIO_ORIGIN}/api/v1/content
```

`STUDIO_ORIGIN` is the Studio site, for example `http://localhost:3000` or `https://studio.example.com`. There is no login, cookie, API key, or shared database. Send `GET`. `OPTIONS` returns 204 with no body. `HEAD` is the framework's header-only form of `GET`. Other methods get the framework's 405 response, which is not the JSON error body below.

Successful reads and handled errors send `Cache-Control: no-store`, `Vary: Origin`, and `X-Content-API-Version: 1`. The body field `apiVersion` is also `1` on a lesson. Fetch again when the student opens a lesson. `no-store` stops a compliant cache from keeping the response. It does not recall a copy the student app already saved.

Browser calls from another origin need that origin listed exactly in Studio's `ALLOWED_CORS_ORIGINS` (comma-separated, no wildcards). Restart Studio after changing it. CORS does not hide the content. A server-side fetch does not need CORS. Do not send credentials.

```ts
async function fetchJson(studioOrigin: string, path: string) {
  const response = await fetch(new URL(path, studioOrigin), {
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      `${response.status}: ${error?.code ?? "CONTENT_FETCH_FAILED"}`,
    );
  }
  return response.json();
}
```

## The three reads

| Read | Method and path | Use it to |
| --- | --- | --- |
| Course list | `GET /api/v1/content/courses` | Show published courses that have at least one published lesson |
| Course outline | `GET /api/v1/content/courses/{courseId}` | Build navigation: ordered chapters, lessons in each chapter, and lessons with no chapter |
| Lesson | `GET /api/v1/content/courses/{courseId}/lessons/{lessonId}` | Render the player for the current published lesson |

`{courseId}` and `{lessonId}` are UUIDs from this API. A title or slug in the path returns 400.

```bash
STUDIO_URL=http://localhost:3000
curl --fail-with-body "$STUDIO_URL/api/v1/content/courses"
COURSE_ID=a1000000-0000-4000-8000-000000000001
curl --fail-with-body "$STUDIO_URL/api/v1/content/courses/$COURSE_ID"
LESSON_ID=a1000000-0000-4000-8000-000000000002
curl --fail-with-body "$STUDIO_URL/api/v1/content/courses/$COURSE_ID/lessons/$LESSON_ID"
```

The UUIDs above are examples. Use the ids your Studio returns.

An empty catalogue is `200` and `[]`. A missing, unpublished, or archived course or lesson is 404. A lesson requested under the wrong course is 404. There is no paging, search, or historical-revision URL in v1.

### Course list

```json
[
  {
    "id": "a1000000-0000-4000-8000-000000000001",
    "slug": "python-basics",
    "title": "Python basics",
    "description": "A first course in Python."
  }
]
```

Order is by title, then id. `slug` is a label for display. Store `id`.

### Course outline

Array order is the published order. Do not sort again. Empty chapters are omitted. Draft and archived lessons are omitted.

```json
{
  "id": "a1000000-0000-4000-8000-000000000001",
  "slug": "python-basics",
  "title": "Python basics",
  "description": "A first course in Python.",
  "chapters": [
    {
      "id": "a1000000-0000-4000-8000-000000000004",
      "title": "Getting started",
      "lessons": [
        {
          "id": "a1000000-0000-4000-8000-000000000002",
          "chapterId": "a1000000-0000-4000-8000-000000000004",
          "slug": "first-python-program",
          "title": "Your first Python program",
          "description": "Use print to display a message.",
          "revisionId": "a1000000-0000-4000-8000-000000000003",
          "contentUrl": "/api/v1/content/courses/a1000000-0000-4000-8000-000000000001/lessons/a1000000-0000-4000-8000-000000000002"
        }
      ]
    }
  ],
  "unassignedLessons": [
    {
      "id": "a1000000-0000-4000-8000-000000000005",
      "chapterId": null,
      "slug": "extra-practice",
      "title": "Extra practice",
      "description": "A published lesson that is not in a chapter.",
      "revisionId": "a1000000-0000-4000-8000-000000000006",
      "contentUrl": "/api/v1/content/courses/a1000000-0000-4000-8000-000000000001/lessons/a1000000-0000-4000-8000-000000000005"
    }
  ]
}
```

Place a lesson by the chapter it appears in. `chapterId` repeats that chapter id. `chapterId` is `null` in `unassignedLessons`. `contentUrl` is a path on the Studio origin, not on the student app origin.

Chapter title, chapter membership, and order are the live course structure. Lesson title, slug, description, and `revisionId` come from the published snapshot, so an unpublished draft edit does not show up here.

### Lesson

`apiVersion` is `1`. `courseId`, `lessonId`, and `revisionId` identify this publication. `steps` is a non-empty ordered array. Each step is `{id, title, blocks}`. A step can have an empty `blocks` array when every component in it was hidden from learners.

```json
{
  "apiVersion": 1,
  "courseId": "a1000000-0000-4000-8000-000000000001",
  "lessonId": "a1000000-0000-4000-8000-000000000002",
  "revisionId": "a1000000-0000-4000-8000-000000000003",
  "title": "Your first Python program",
  "slug": "first-python-program",
  "description": "Use print to display a message.",
  "track": "Python",
  "programmingLanguage": "Python",
  "tags": ["beginner"],
  "steps": [
    {
      "id": "first-program",
      "title": "Say hello",
      "blocks": []
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `track` | `Python`, `R`, or `literacy` |
| `programmingLanguage` | `Python`, `R`, or `""` |
| `tags` | Display labels |
| `blocks` | Learner-visible components, in order. The JSON name is `blocks`. Each `id` is the component id |

The lesson body does not repeat `chapterId`. Read the chapter from the outline.

If the outline names revision A and the lesson fetch returns revision B, show the lesson you fetched and store that response's `revisionId`. Refetch the outline when the menu must match.

## Identifiers

| Id | Where | Format | Stability |
| --- | --- | --- | --- |
| Course | list and outline `id`; lesson `courseId` | UUID | Stable. Renaming the course does not change it |
| Chapter | outline chapter `id` and lesson summary `chapterId` | UUID, or `null` when unassigned | Stable. Renaming or reordering does not change it. Moving a lesson changes that lesson's `chapterId` |
| Lesson | outline lesson `id`; lesson `lessonId` | UUID | Stable across republish |
| Revision | outline `revisionId`; lesson `revisionId` | UUID | Changes when that lesson is published again |
| Step | `steps[].id` | String, at least one character. Often a slug such as `first-program` | Stable while authors keep the same step. Unique inside the lesson, not across lessons |
| Component | `blocks[].id` | String, at least one character | Stable while authors keep the same component. Unique inside the lesson, not across lessons |
| MCQ choice | `choices[].id` | String, at least one character | Stable while authors keep that choice. Unique inside the question |

Do not use `title` or `slug` as a progress key. A republish can change them. Step and component ids must be stored together with `lessonId`.

## Components

Every component has `id`, `type`, and `visible: true`. `advanced` may be present. It is a display hint, such as "show this later". It is not access control. Hidden components are removed before the response is sent. They are not included with `visible: false`.

Unknown `type` values should render as unsupported. Do not mark an unsupported component complete.

| `type` | What to render | Fields |
| --- | --- | --- |
| `text` | Markdown | `markdown` |
| `task` | Statement, context, and named functions | `statement`, `context`, `functions: [{name, summary}]` |
| `quick-reference` | Titled Markdown | `title`, `markdown` |
| `worked-example` | Code, explanation, optional run | `title?`, `language`, `code`, `explanation`, `runnable`, `expectedOutput?` |
| `figure` | Image plus Markdown | `imageUrl`, `alt`, `caption?`, `markdown` |
| `mcq` | Question and choices | `question`, `multiple`, `choices: [{id, text, correct}]`, `explanation` |
| `code-exercise` | Instructions and starter code | `language`, `starterCode`, `execution`, `instructions`, `expectedOutput?` |
| `reflection` | Prompt. The student's answer is not in this payload | `prompt` |
| `data-asset` | Resource link. This is the resource component | `url`, `filename`, `runtimePath?`, `description` |

`language` on code components is `python` or `r`. `execution` is `browser` or `server`. Studio does not run learner code for this API. The student app runs `browser` work in its own runtime, or shows that a `server` exercise is unavailable. `runnable: false` on a worked example means show the code without a run button. `runtimePath` is a hint for the student app's runtime. Studio does not mount that file.

Treat Markdown and URLs as authored content. Render Markdown without raw HTML. Allow image and resource links only when they are `http` or `https`.

```json
{ "id": "intro", "type": "text", "visible": true, "markdown": "Use **print** to display text." }
```

```json
{
  "id": "create-greeting",
  "type": "task",
  "visible": true,
  "statement": "Create a variable named `greeting`, then display it.",
  "context": "You will reuse this variable in the next example.",
  "functions": [
    { "name": "print(value)", "summary": "Display a value in the output panel." }
  ]
}
```

```json
{
  "id": "python-essentials",
  "type": "quick-reference",
  "visible": true,
  "title": "Quick reference",
  "markdown": "`print(value)` displays a value."
}
```

```json
{
  "id": "hello-example",
  "type": "worked-example",
  "visible": true,
  "title": "Hello",
  "language": "python",
  "code": "print('Hello')",
  "explanation": "The program displays Hello.",
  "runnable": true,
  "expectedOutput": "Hello"
}
```

```json
{
  "id": "output-figure",
  "type": "figure",
  "visible": true,
  "imageUrl": "https://example.com/output.png",
  "alt": "Program output showing Hello",
  "caption": "Printed output",
  "markdown": "The panel shows the text the program printed."
}
```

```json
{
  "id": "which-function",
  "type": "mcq",
  "visible": true,
  "question": "Which function displays text?",
  "multiple": false,
  "choices": [
    { "id": "print-choice", "text": "print", "correct": true },
    { "id": "input-choice", "text": "input", "correct": false }
  ],
  "explanation": "`print` writes text to the output."
}
```

`correct` and `explanation` are public so the student app can give immediate feedback. Anyone can read them. Do not treat this as a secure grade.

```json
{
  "id": "hello-exercise",
  "type": "code-exercise",
  "visible": true,
  "language": "python",
  "starterCode": "# Write your code here\n",
  "execution": "browser",
  "instructions": "Set `greeting` to `\"Hello\"`, then print it.",
  "expectedOutput": "Hello"
}
```

```json
{
  "id": "what-you-learned",
  "type": "reflection",
  "visible": true,
  "prompt": "What does print do?"
}
```

```json
{
  "id": "practice-data",
  "type": "data-asset",
  "visible": true,
  "url": "https://example.com/practice.csv",
  "filename": "practice.csv",
  "runtimePath": "/data/practice.csv",
  "description": "Sample rows for the exercise."
}
```

## What this API leaves out

This API is unauthenticated. Anything it returns can be read by every client. These author-only fields are therefore absent, not "available if the other app asks":

| Left out | Why it stays off this payload |
| --- | --- |
| Solution | The model answer for a code exercise |
| Automated check | The script that decides pass or fail |
| Additional penalties | Extra review penalties for a code exercise |
| Ignored issues | Review findings the author told the checker to skip |
| Assistant settings | Course and lesson `suggestedQuestions` and `constraints` |
| Source Markdown | The authoring document the editor imports and exports |
| Drafts | Unpublished edits, the draft version counter, and hidden components |
| Reflection rubric | `keyIdeas`, `misconceptions`, and `variants` used to review a reflection |

A future authenticated read would be required before the other app can apply hidden checks or review lists. That read does not exist yet. Do not call the staff draft, history, or publish routes to obtain it.

## What the other app stores

Studio does not accept or save any of the following. The student app keeps them under its own student id:

- Enrolment and whether this student may open a course
- Which course, chapter, lesson, step, and component the student has opened or finished
- The `revisionId` of the publication they worked on
- MCQ selections, code the student wrote, reflection text, and attempts
- Scores, completion, and whether an older attempt still counts after a new `revisionId`
- Any record it needs after Studio drops an old publication

Studio keeps at most five published snapshots so staff can restore a draft. The public API returns only the current one. There is no request for an older `revisionId`.

A practical progress record is: student id, `courseId`, `chapterId` (or an explicit unassigned marker), `lessonId`, `revisionId`, and, when the record is finer than a lesson, step id and component id. When `revisionId` changes, compare it with the stored one and apply the student app's own rule.

## Errors

Handled errors are JSON: `{ "error": "Readable message", "code": "MACHINE_CODE" }`.

| Status | Code | What to do |
| --- | --- | --- |
| 400 | `INVALID_ID` | The path id is not a UUID. Fix the request. Do not retry it unchanged |
| 404 | `PUBLISHED_CONTENT_NOT_FOUND` | The course or lesson is not currently published. Show it as unavailable and refresh the outline |
| 500 | `INTERNAL_ERROR` | Studio withheld the internal error. Retry a few times with delay and jitter |

A proxy can return other statuses or a non-JSON body. Do not retry forever. v1 has no application rate limit.

Each outline and each lesson is read from one consistent database snapshot. Two separate requests can still see two publications if someone republishes between them. Use the `revisionId` on the lesson body you rendered.
