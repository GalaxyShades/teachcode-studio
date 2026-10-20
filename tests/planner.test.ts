import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { cookies } from "next/headers";
import { db } from "../lib/db";
import { migrate } from "../scripts/migrate";
import { defaults, validateDraft, type LessonDraft } from "../lib/content";
import { emptyDraft } from "../lib/cms";
import { parseLessonMarkdown, serializeLessonMarkdown } from "../lib/markdown";
import { loadRevision, persistDraft, writeRevision } from "../lib/repository";
import {
  createValidationGate,
  issueValidationToken,
} from "../lib/planner/gate";
import {
  plannerExampleLesson,
  plannerSystemPrompt,
} from "../lib/planner/prompt";
import { runPlannerTool, type PlannerToolContext } from "../lib/planner/tools";
import type { User } from "../lib/auth";
import {
  isGlmModelId,
  lessonModelForCall,
  lessonWritingModels,
} from "../lib/openrouter";
import { POST as chat } from "../app/api/planner/chat/route";
import {
  DELETE as removeAttachment,
  POST as upload,
} from "../app/api/planner/attachments/route";
import { DELETE as clearThread } from "../app/api/planner/thread/route";

const dir = mkdtempSync(join(tmpdir(), "teachcode-planner-"));
const admin = "admin-planner";
const staff = "staff-planner";
const courseA = "course-a";
const courseB = "course-b";
const lessonA = "lesson-a";
const lessonB = "lesson-b";
const revisionA = "revision-a";
const revisionB = "revision-b";
const sessions = {
  admin: "session-admin",
  staff: "session-staff",
};
const adminUser: User = {
  id: admin,
  email: "admin@hku.hk",
  display_name: "Admin",
  role: "admin",
};
const staffUser: User = {
  id: staff,
  email: "staff@hku.hk",
  display_name: "Staff",
  role: "staff",
};

function asUser(token?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      token && name === "teachcode_cms_session" ? { value: token } : undefined,
  } as never);
}

function context(user: User, threadId = "detached-thread"): PlannerToolContext {
  return {
    user,
    threadId,
    gate: createValidationGate(),
    seenVersions: new Map(),
  };
}

function lessonMarkdown(title: string, slug: string, body = "A short lesson.") {
  const draft: LessonDraft = {
    title,
    slug,
    description: "First-year students practise one idea.",
    track: "Python",
    programmingLanguage: "Python",
    tags: ["sample"],
    version: 0,
    steps: [
      {
        id: `${slug}-step`,
        title: "Introduction",
        blocks: [{ ...defaults.text(), id: `${slug}-text`, markdown: body }],
      },
    ],
  };
  return serializeLessonMarkdown(draft);
}

function tinyPdf(text: string) {
  const stream = `BT /F1 18 Tf 36 100 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++)
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body);
}

async function lessonRow(courseId: string, slug: string) {
  return (
    await db().query(
      "SELECT * FROM cms_lessons WHERE course_id=$1 AND slug=$2",
      [courseId, slug],
    )
  ).rows[0];
}

async function draftOf(lessonId: string) {
  const lesson = (
    await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonId])
  ).rows[0];
  return loadRevision(db(), lesson, lesson.draft_revision_id);
}

function jsonRequest(
  url: string,
  body: unknown,
  origin = "http://localhost:3000",
) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function modelReply(message: unknown) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
  });
}

beforeAll(async () => {
  process.env.DATABASE_MODE = "sqlite";
  process.env.SQLITE_DATABASE_PATH = join(dir, "test.db");
  process.env.APP_URL = "http://localhost:3000";
  new DatabaseSync(process.env.SQLITE_DATABASE_PATH).close();
  await migrate();
  for (const user of [adminUser, staffUser])
    await db().query(
      "INSERT INTO profiles(id,email,display_name,role,password_hash) VALUES($1,$2,$3,$4,$5)",
      [user.id, user.email, user.display_name, user.role, "unused"],
    );
  const expiry = new Date(Date.now() + 3600000).toISOString();
  for (const [userId, token] of [
    [admin, sessions.admin],
    [staff, sessions.staff],
  ] as const)
    await db().query(
      "INSERT INTO auth_sessions(token,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)",
      [token, userId, new Date().toISOString(), expiry],
    );
  await db().query(
    "INSERT INTO cms_courses(id,slug,title,created_by) VALUES($1,$2,$3,$4)",
    [courseA, "assigned-course", "Assigned course", admin],
  );
  await db().query(
    "INSERT INTO cms_courses(id,slug,title,created_by) VALUES($1,$2,$3,$4)",
    [courseB, "private-course", "Private course", admin],
  );
  await db().query(
    "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3)",
    [courseA, staff, admin],
  );
  const assigned = {
    title: "Assigned draft",
    slug: "assigned-draft",
    description: "A draft the assigned teacher can edit.",
    track: "Python" as const,
    programmingLanguage: "Python" as const,
    tags: ["python"],
    version: 0,
    steps: [
      {
        id: "assigned-step",
        title: "Start",
        blocks: [
          {
            ...defaults.text(),
            id: "assigned-text",
            markdown: "ASSIGNED-BODY-SENTENCE",
          },
        ],
      },
    ],
  };
  const secret = {
    ...assigned,
    title: "Private draft",
    slug: "private-draft",
    steps: [
      {
        id: "private-step",
        title: "Start",
        blocks: [
          {
            ...defaults.text(),
            id: "private-text",
            markdown: "SECRET-OTHER-COURSE",
          },
        ],
      },
    ],
  };
  for (const [courseId, lessonId, revisionId, draft] of [
    [courseA, lessonA, revisionA, assigned],
    [courseB, lessonB, revisionB, secret],
  ] as const) {
    await db().query(
      "INSERT INTO cms_lessons(id,course_id,slug,title,updated_by) VALUES($1,$2,$3,$4,$5)",
      [lessonId, courseId, draft.slug, draft.title, admin],
    );
    await db().query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [revisionId, lessonId, admin],
    );
    await db().query(
      "UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2",
      [revisionId, lessonId],
    );
    await db().transaction((client) =>
      writeRevision(client, revisionId, draft, admin),
    );
  }
  await db().query(
    "INSERT INTO cms_openrouter_settings(profile_id,api_key,model) VALUES($1,$2,$3)",
    [staff, "planner-test-key", "qwen/qwen3.7-max"],
  );
});

beforeEach(() => {
  asUser();
});

afterAll(async () => {
  await db().end();
  rmSync(dir, { recursive: true, force: true });
});

describe("planner prompt", () => {
  it("ships an example lesson that passes validation", () => {
    const parsed = parseLessonMarkdown(plannerExampleLesson, emptyDraft());
    expect(parsed.errors).toEqual([]);
    expect(validateDraft(parsed.draft)).toEqual([]);
    expect(plannerSystemPrompt()).not.toContain(
      "Return only the lesson Markdown",
    );
    expect(plannerSystemPrompt()).toContain(plannerExampleLesson);
    expect(plannerSystemPrompt()).toContain("worked-example");
    expect(plannerSystemPrompt()).toContain("code-exercise");
    expect(plannerSystemPrompt()).toContain(
      "Python lesson code may import only numpy, matplotlib, sklearn, pandas, scipy, statsmodels, seaborn, and the Python standard library that ships with Pyodide (including math and statistics); those packages are already downloaded and available in the browser runtime, and you must not import or install anything else.",
    );
    const blocks = parsed.draft?.steps.flatMap((step) => step.blocks) ?? [];
    const example = blocks.find((block) => block.type === "worked-example");
    const exercise = blocks.find((block) => block.type === "code-exercise");
    expect(example?.type).toBe("worked-example");
    expect(exercise?.type).toBe("code-exercise");
    if (example?.type === "worked-example")
      expect(example.code.trim().length).toBeGreaterThan(0);
    if (exercise?.type === "code-exercise") {
      expect(exercise.starterCode.trim().length).toBeGreaterThan(0);
      expect(exercise.solution?.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps GLM ids out of the selectable list and falls back to Qwen", () => {
    expect(isGlmModelId("z-ai/glm-5.3-flash")).toBe(true);
    expect(isGlmModelId("z-ai/glm-4.6")).toBe(true);
    expect(isGlmModelId("qwen/qwen3.7-max")).toBe(false);
    expect(lessonModelForCall("z-ai/glm-5.3-flash")).toBe("qwen/qwen3.7-max");
    expect(lessonModelForCall("qwen/qwen3.7-max")).toBe("qwen/qwen3.7-max");
    const offered = lessonWritingModels([
      { id: "qwen/qwen3.7-max", name: "Qwen" },
      { id: "z-ai/glm-5.3-flash", name: "GLM" },
      { id: "z-ai/glm-4.6", name: "GLM 4.6" },
      { id: "x-ai/grok-4.7", name: "Grok" },
    ]);
    expect(offered.map((model) => model.id)).toEqual([
      "qwen/qwen3.7-max",
      "x-ai/grok-4.7",
    ]);
    expect(offered.some((model) => /glm/i.test(model.id))).toBe(false);
  });
});

describe("planner validation gate", () => {
  it("rejects a write without a matching token even when the Markdown is valid", async () => {
    const ctx = context(adminUser);
    const markdown = lessonMarkdown("Gate lesson", "gate-lesson");
    const forged = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown,
        validationToken: "not-a-real-token",
      },
      ctx,
    );
    expect(forged.ok).toBe(false);
    expect(await lessonRow(courseA, "gate-lesson")).toBeUndefined();

    const other = lessonMarkdown("Other lesson", "other-lesson");
    const validated = await runPlannerTool(
      "validate_lesson",
      { markdown },
      ctx,
    );
    expect(validated.ok).toBe(true);
    const mismatched = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown: other,
        validationToken: validated.validationToken,
      },
      ctx,
    );
    expect(mismatched.ok).toBe(false);
    expect(await lessonRow(courseA, "other-lesson")).toBeUndefined();

    const otherGate = context(adminUser);
    const foreign = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown,
        validationToken: validated.validationToken,
      },
      otherGate,
    );
    expect(foreign.ok).toBe(false);
    expect(await lessonRow(courseA, "gate-lesson")).toBeUndefined();

    const created = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown,
        validationToken: validated.validationToken,
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    expect(await lessonRow(courseA, "gate-lesson")).toMatchObject({
      title: "Gate lesson",
      chapter_id: null,
    });
  });

  it("does not create or update a lesson from invalid Markdown", async () => {
    const ctx = context(staffUser);
    const bad = "this is not a lesson";
    const validated = await runPlannerTool(
      "validate_lesson",
      { markdown: bad },
      ctx,
    );
    expect(validated.ok).toBe(false);
    expect(validated).not.toHaveProperty("validationToken");
    expect(String(JSON.stringify(validated))).toMatch(/Line /);

    const before = await draftOf(lessonA);
    const missing = await runPlannerTool(
      "update_lesson",
      {
        courseId: courseA,
        lessonId: lessonA,
        markdown: bad,
        validationToken: "forged",
      },
      ctx,
    );
    expect(missing.ok).toBe(false);
    const bound = issueValidationToken(ctx.gate, bad);
    const forced = await runPlannerTool(
      "update_lesson",
      {
        courseId: courseA,
        lessonId: lessonA,
        markdown: bad,
        validationToken: bound,
      },
      ctx,
    );
    expect(forced.ok).toBe(false);
    const created = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown: bad,
        validationToken: bound,
      },
      ctx,
    );
    expect(created.ok).toBe(false);
    expect((await draftOf(lessonA)).title).toBe(before.title);
    expect(await lessonRow(courseA, "this-is-not-a-lesson")).toBeUndefined();
  });
});

describe("planner access", () => {
  it("lets staff read and edit an assigned course, and blocks the other course and chapters", async () => {
    const ctx = context(staffUser);
    const listed = await runPlannerTool("list_courses", {}, ctx);
    expect(listed.ok).toBe(true);
    const titles = listed.courses.map(
      (course: { title: string }) => course.title,
    );
    expect(titles).toContain("Assigned course");
    expect(titles).not.toContain("Private course");
    expect(JSON.stringify(listed)).not.toContain("SECRET-OTHER-COURSE");
    expect(JSON.stringify(listed)).not.toContain("ASSIGNED-BODY-SENTENCE");

    const read = await runPlannerTool(
      "read_lesson",
      { courseId: courseA, lessonId: lessonA },
      ctx,
    );
    expect(read.ok).toBe(true);
    expect(read.markdown).toContain("ASSIGNED-BODY-SENTENCE");

    const hidden = await runPlannerTool(
      "read_lesson",
      { courseId: courseB, lessonId: lessonB },
      ctx,
    );
    expect(hidden.ok).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain("SECRET-OTHER-COURSE");

    const renamed = String(read.markdown).replace(
      'title="Assigned draft"',
      'title="Assigned draft revised"',
    );
    const validated = await runPlannerTool(
      "validate_lesson",
      { markdown: renamed },
      ctx,
    );
    expect(validated.ok).toBe(true);
    const updated = await runPlannerTool(
      "update_lesson",
      {
        courseId: courseA,
        lessonId: lessonA,
        markdown: renamed,
        validationToken: validated.validationToken,
      },
      ctx,
    );
    expect(updated.ok).toBe(true);
    expect(updated.href).toBe(
      "/courses/assigned-course/lessons/assigned-draft/edit",
    );
    expect((await draftOf(lessonA)).title).toBe("Assigned draft revised");

    const elsewhere = lessonMarkdown("Blocked lesson", "blocked-lesson");
    const token = (
      await runPlannerTool("validate_lesson", { markdown: elsewhere }, ctx)
    ).validationToken;
    const blocked = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseB,
        markdown: elsewhere,
        validationToken: token,
      },
      ctx,
    );
    expect(blocked.ok).toBe(false);
    expect(await lessonRow(courseB, "blocked-lesson")).toBeUndefined();

    asUser(sessions.staff);
    const chapter = await runPlannerTool(
      "create_chapter",
      { courseId: courseA, title: "Staff chapter" },
      ctx,
    );
    expect(chapter.ok).toBe(false);
    expect(chapter.error).toMatch(/admin/i);
    const moved = await runPlannerTool(
      "move_lesson",
      { courseId: courseA, lessonId: lessonA, chapterId: "missing" },
      ctx,
    );
    expect(moved.ok).toBe(false);
    expect(moved.error).toMatch(/admin/i);
  });

  it("keeps a newer editor save when the chatbot's read is stale", async () => {
    const ctx = context(staffUser);
    const read = await runPlannerTool(
      "read_lesson",
      { courseId: courseA, lessonId: lessonA },
      ctx,
    );
    expect(read.ok).toBe(true);
    const lesson = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonA])
    ).rows[0];
    const current = await loadRevision(db(), lesson, lesson.draft_revision_id);
    await persistDraft(
      courseA,
      lessonA,
      {
        ...current,
        title: "Saved in the editor",
        version: Number(lesson.version),
      },
      admin,
    );
    const validated = await runPlannerTool(
      "validate_lesson",
      { markdown: read.markdown },
      ctx,
    );
    const stale = await runPlannerTool(
      "update_lesson",
      {
        courseId: courseA,
        lessonId: lessonA,
        markdown: read.markdown,
        validationToken: validated.validationToken,
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect((await draftOf(lessonA)).title).toBe("Saved in the editor");
  });

  it("lets an admin add a chapter and place a new lesson in it", async () => {
    asUser(sessions.admin);
    const ctx = context(adminUser);
    const createdChapter = await runPlannerTool(
      "create_chapter",
      { courseId: courseA, title: "Week one" },
      ctx,
    );
    expect(createdChapter.ok).toBe(true);
    const markdown = lessonMarkdown("Placed lesson", "placed-lesson");
    const validated = await runPlannerTool(
      "validate_lesson",
      { markdown },
      ctx,
    );
    const created = await runPlannerTool(
      "create_lesson",
      {
        courseId: courseA,
        markdown,
        validationToken: validated.validationToken,
        chapterId: createdChapter.chapterId,
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    expect(await lessonRow(courseA, "placed-lesson")).toMatchObject({
      chapter_id: createdChapter.chapterId,
    });

    const nextChapter = await runPlannerTool(
      "create_chapter",
      { courseId: courseA, title: "Week two" },
      ctx,
    );
    expect(nextChapter.ok).toBe(true);
    const moved = await runPlannerTool(
      "move_lesson",
      {
        courseId: courseA,
        lessonId: created.lessonId,
        chapterId: nextChapter.chapterId,
      },
      ctx,
    );
    expect(moved.ok).toBe(true);
    expect((await lessonRow(courseA, "placed-lesson")).chapter_id).toBe(
      nextChapter.chapterId,
    );
  });
});

describe("planner attachments", () => {
  it("extracts PDF and plain text, warns on a scan without storing it, and clears only that thread", async () => {
    asUser(sessions.admin);
    const textForm = new FormData();
    textForm.set(
      "file",
      new File(["Variables store values."], "notes.txt", {
        type: "text/plain",
      }),
    );
    const textResponse = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: textForm,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(textResponse.status).toBe(201);
    const textBody = await textResponse.json();

    const pdfForm = new FormData();
    pdfForm.set(
      "file",
      new File([tinyPdf("Hello PDF")], "slides.pdf", {
        type: "application/pdf",
      }),
    );
    const pdfResponse = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: pdfForm,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(pdfResponse.status).toBe(201);
    const pdfBody = await pdfResponse.json();

    const threadId = (
      await db().query(
        "SELECT id FROM cms_planner_threads WHERE profile_id=$1",
        [admin],
      )
    ).rows[0].id as string;
    const notes = await runPlannerTool(
      "read_attachment",
      { attachmentId: textBody.id },
      context(adminUser, threadId),
    );
    const slides = await runPlannerTool(
      "read_attachment",
      { attachmentId: pdfBody.id },
      context(adminUser, threadId),
    );
    expect(notes).toMatchObject({ ok: true, text: "Variables store values." });
    expect(slides.ok).toBe(true);
    expect(slides.text).toContain("Hello PDF");
    const outsider = await runPlannerTool(
      "read_attachment",
      { attachmentId: textBody.id },
      context(staffUser, "someone-else"),
    );
    expect(outsider.ok).toBe(false);

    const scanForm = new FormData();
    scanForm.set(
      "file",
      new File([tinyPdf("")], "scan.pdf", { type: "application/pdf" }),
    );
    const scan = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: scanForm,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(scan.status).toBe(200);
    const scanBody = await scan.json();
    expect(scanBody.warning).toMatch(/no selectable text/);
    expect(scanBody.id).toBeUndefined();
    expect(
      (
        await db().query(
          "SELECT id FROM cms_planner_attachments WHERE filename=$1",
          ["scan.pdf"],
        )
      ).rowCount,
    ).toBe(0);

    const slidesForm = new FormData();
    slidesForm.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "deck.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );
    const deck = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: slidesForm,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(deck.status).toBe(400);
    expect((await deck.json()).error).toMatch(
      /\.md, \.txt, \.markdown, \.pdf, or \.docx/,
    );

    asUser(sessions.staff);
    const big = new FormData();
    big.set(
      "file",
      new File(["a".repeat(80_000)], "long.txt", { type: "text/plain" }),
    );
    expect(
      (
        await upload(
          new Request("http://localhost:3000/api/planner/attachments", {
            method: "POST",
            body: big,
            headers: { origin: "http://localhost:3000" },
          }),
        )
      ).status,
    ).toBe(201);
    const extra = new FormData();
    extra.set("file", new File(["b"], "more.txt", { type: "text/plain" }));
    const overflow = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: extra,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).error).toMatch(/80,000/);

    const cleared = await clearThread(
      new Request("http://localhost:3000/api/planner/thread", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(cleared.status).toBe(200);
    expect(
      (
        await db().query(
          "SELECT id FROM cms_planner_attachments WHERE thread_id IN (SELECT id FROM cms_planner_threads WHERE profile_id=$1)",
          [staff],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db().query("SELECT id FROM cms_planner_attachments WHERE id=$1", [
          textBody.id,
        ])
      ).rowCount,
    ).toBe(1);

    asUser(sessions.admin);
    const removed = await removeAttachment(
      new Request(
        `http://localhost:3000/api/planner/attachments?id=${textBody.id}`,
        { method: "DELETE", headers: { origin: "http://localhost:3000" } },
      ),
    );
    expect(removed.status).toBe(200);
    const removedAgain = await removeAttachment(
      new Request(
        `http://localhost:3000/api/planner/attachments?id=${textBody.id}`,
        { method: "DELETE", headers: { origin: "http://localhost:3000" } },
      ),
    );
    expect(removedAgain.status).toBe(200);
    const missing = await removeAttachment(
      new Request(
        "http://localhost:3000/api/planner/attachments?id=missing-attachment",
        { method: "DELETE", headers: { origin: "http://localhost:3000" } },
      ),
    );
    expect(missing.status).toBe(200);
    expect(
      (
        await db().query("SELECT id FROM cms_planner_attachments WHERE id=$1", [
          textBody.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
});

describe("planner chat route", () => {
  it("calls Qwen when the saved model is a GLM id and leaves the key in place", async () => {
    asUser(sessions.staff);
    await db().query(
      "UPDATE cms_openrouter_settings SET model=$1 WHERE profile_id=$2",
      ["z-ai/glm-5.3-flash", staff],
    );
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const sent = JSON.parse(String(init?.body));
          expect(sent.model).toBe("qwen/qwen3.7-max");
          expect(JSON.stringify(sent)).not.toContain("planner-test-key");
          return modelReply({ content: "Ready." });
        }),
      );
      const response = await chat(
        jsonRequest("http://localhost:3000/api/planner/chat", {
          message: "Hello",
          path: "/courses",
        }),
      );
      expect(response.status).toBe(200);
      const stored = (
        await db().query<{ model: string; api_key: string }>(
          "SELECT model, api_key FROM cms_openrouter_settings WHERE profile_id=$1",
          [staff],
        )
      ).rows[0];
      expect(stored.model).toBe("z-ai/glm-5.3-flash");
      expect(stored.api_key).toBe("planner-test-key");
    } finally {
      await db().query(
        "UPDATE cms_openrouter_settings SET model=$1 WHERE profile_id=$2",
        ["qwen/qwen3.7-max", staff],
      );
      vi.unstubAllGlobals();
    }
  });

  it("streams validation before a staff member's lesson is stored", async () => {
    asUser(sessions.staff);
    const markdown = lessonMarkdown(
      "Chat lesson",
      "chat-lesson",
      "Name a value.",
    );
    let step = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body));
        step += 1;
        expect(sent.model).toBe("qwen/qwen3.7-max");
        expect(sent.messages[0].content).toContain(
          "/courses/assigned-course/lessons/assigned-draft/edit",
        );
        expect(sent.messages[0].content).not.toContain(
          "Return only the lesson Markdown",
        );
        const names = sent.tools.map(
          (tool: { function: { name: string } }) => tool.function.name,
        );
        expect(names).toContain("validate_lesson");
        expect(names).not.toContain("publish_lesson");
        if (step === 1)
          return modelReply({
            content: null,
            tool_calls: [
              {
                id: "call-validate",
                type: "function",
                function: {
                  name: "validate_lesson",
                  arguments: JSON.stringify({ markdown }),
                },
              },
            ],
          });
        if (step === 2) {
          const tool = sent.messages.find(
            (message: { role: string }) => message.role === "tool",
          );
          const payload = JSON.parse(tool.content);
          expect(payload.validationToken).toEqual(expect.any(String));
          return modelReply({
            content: null,
            tool_calls: [
              {
                id: "call-create",
                type: "function",
                function: {
                  name: "create_lesson",
                  arguments: JSON.stringify({
                    courseId: courseA,
                    markdown,
                    validationToken: payload.validationToken,
                  }),
                },
              },
            ],
          });
        }
        return modelReply({ content: "I saved a short lesson." });
      }),
    );
    const response = await chat(
      jsonRequest("http://localhost:3000/api/planner/chat", {
        message: "Add one short lesson about variables.",
        path: "/courses/assigned-course/lessons/assigned-draft/edit",
      }),
    );
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const statuses = events
      .filter((event) => event.type === "status")
      .map((event) => event.text);
    expect(statuses.indexOf("Validating lesson…")).toBeGreaterThanOrEqual(0);
    expect(statuses.indexOf("Validating lesson…")).toBeLessThan(
      statuses.indexOf("Creating lesson…"),
    );
    const reply = events.find((event) => event.type === "reply");
    expect(reply.text).toContain(
      "/courses/assigned-course/lessons/chat-lesson/edit",
    );
    expect(await lessonRow(courseA, "chat-lesson")).toMatchObject({
      title: "Chat lesson",
      status: "draft",
    });
    vi.unstubAllGlobals();
  });

  it("does not store a valid lesson when the model skips validation", async () => {
    asUser(sessions.staff);
    const markdown = lessonMarkdown("Skipped lesson", "skipped-lesson");
    let step = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body));
        step += 1;
        if (step === 1)
          return modelReply({
            content: null,
            tool_calls: [
              {
                id: "call-create",
                type: "function",
                function: {
                  name: "create_lesson",
                  arguments: JSON.stringify({
                    courseId: courseA,
                    markdown,
                    validationToken: "forged",
                  }),
                },
              },
            ],
          });
        const tool = sent.messages.find(
          (message: { role: string }) => message.role === "tool",
        );
        expect(tool.content).toContain("Validate this exact lesson Markdown");
        return modelReply({ content: "I could not save that lesson." });
      }),
    );
    const response = await chat(
      jsonRequest("http://localhost:3000/api/planner/chat", {
        message: "Save this lesson without checking it.",
        path: "/courses/assigned-course",
      }),
    );
    expect(response.status).toBe(200);
    expect(await lessonRow(courseA, "skipped-lesson")).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
