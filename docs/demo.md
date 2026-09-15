# Five-minute local demo

## Start the app

Requires Node.js 22.13+.

```sh
npm install
# First setup only; keep your existing .env.local if already configured.
cp .env.example .env.local
npm run db:init:sqlite
npm run dev
```

Open [localhost:3000/login](http://localhost:3000/login) and sign in with
`admin@hku.hk` / `password`. These are local demo accounts only.
If already set up, run just `npm run dev`. Initialization preserves existing
lesson edits, so an older seeded lesson may differ from the latest template.
Create a new lesson, open **Templates & AI prompt → Complete Markdown template**,
download it, and import it to show the latest reference without overwriting your
previous work. The UI template keeps the new lesson’s unique slug. If importing
`content/component-reference.md` directly, change its slug when another lesson
already uses `component-reference`.

## Walkthrough and narration

| Time | Show                                                                   | Suggested narration                                                                                                                                         |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Course content dashboard → Python Foundations                          | “Staff see their assigned courses; admins manage content and publishing.”                                                                                   |
| 0:30 | Component reference lesson, or a new lesson with the template imported | “A lesson is a sequence of steps. Each step contains focused cards for explanations, examples, questions, and practice.”                                    |
| 1:00 | Edit the Markdown text card, then Done                                 | “The editor stays compact. Open only the card you need, and drag cards to reorder.”                                                                         |
| 1:30 | Templates & AI prompt                                                  | “Copy this prompt into your AI app with slides or a document. It includes the complete authoring format, so the output can be pasted straight into Studio.” |
| 2:15 | Complete Markdown template → Download; close dialog                    | “The template demonstrates all eleven components and supported formatting, including answer choices, code checks, and reflection rubrics.”                  |
| 2:45 | Markdown tab → Rich Editor → Show preview                              | “The same lesson can be edited as Markdown or cards. Invalid Markdown shows diagnostics and blocks publication.”                                            |
| 3:30 | Practice and reflect step                                              | “Learners can practice with Python or R. First execution downloads a browser runtime, so warm it up before presenting.”                                     |
| 4:15 | Save draft → Publish → course’s learner link                           | “Publishing creates an independent snapshot. Later draft edits do not change the learner version until we publish again.”                                   |

An actual AI generation can take longer than the demo. Use the included reference
for a predictable walkthrough and show the prompt workflow without waiting for a
live generation. Browser code runtimes need CDN access; ordinary editing and
preview work locally. Tutor/review settings are metadata, not a connected AI tutor.
Sample image/data links are placeholders to replace with your own resources.

## Screenshots ready to share

The screenshots below come from the actual local app with a disposable SQLite
database and seeded demo accounts. No existing drafts are changed by capture.

- [Course dashboard](screenshots/01-courses.png)
- [Compact lesson editor](screenshots/02-editor.png)
- [Copyable AI prompt and template toolkit](screenshots/03-ai-toolkit.png)
- [Learner practice preview](screenshots/04-learner.png)

Regenerate all four at 1440 × 1000:

```sh
npx playwright install chromium
npm run demo:screenshots
```

Capture starts and stops its own local server on port 3100. Keep that port free;
your regular demo on port 3000 can remain running. Images are written to
`docs/screenshots/`. The capture uses the included reference, not AI-generated
source material. To capture a specific lesson you authored, open it locally and
take screenshots directly from your browser.

## Verification for this demo

Verified locally on 2026-09-15 with Node 22 and Chromium:

- Lint, TypeScript checks, and production build passed.
- 33 unit/SQLite tests and 3 real PostgreSQL tests passed.
- All 10 browser checks passed with runtime checks and screenshot capture enabled:
  accessibility, mobile editing, clipboard fallback, template download/import,
  autosave, duplicate-slug recovery, drag/keyboard ordering, publication,
  permissions, and real Python/R browser execution.
- The production server loaded the editor and complete AI toolkit successfully.

The tests exercise the local Studio. They do not verify the shared TeachCode
deployment or factual accuracy of content generated by an external AI app.
