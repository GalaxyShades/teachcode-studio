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
import {
  loadRevision,
  persistDraft,
  publishRevision,
  writeRevision,
} from "../lib/repository";
import {
  createValidationGate,
  issueValidationToken,
} from "../lib/planner/gate";
import {
  markdownFieldPrompt,
  plannerExampleLesson,
  plannerSystemPrompt,
} from "../lib/planner/prompt";
import {
  plannerToolSchemas,
  runPlannerTool,
  type PlannerToolContext,
} from "../lib/planner/tools";
import { editChapter, moveLesson } from "../lib/management";
import type { User } from "../lib/auth";
import {
  isGlmModelId,
  lessonModelForCall,
  lessonWritingModels,
} from "../lib/openrouter";
import { POST as chat } from "../app/api/planner/chat/route";
import {
  messageWithAttachments,
  readMessageAttachments,
} from "../lib/planner/message-text";
import {
  plannerReloadsLesson,
  plannerWriteChange,
} from "../lib/planner/events";
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

function textCard(id: string | undefined, body: string) {
  const attrs = id ? `id="${id}" visible=true` : "visible=true";
  return [`:::text{${attrs}}`, ":::markdown", body, ":::", ":::"].join("\n");
}

function exerciseCard(id: string) {
  return [
    `:::code-exercise{id="${id}" visible=true}`,
    ":::language",
    "python",
    ":::",
    ":::starterCode",
    "points = 0",
    ":::",
    ":::solution",
    "points = 5",
    ":::",
    ":::execution",
    "browser",
    ":::",
    ":::instructions",
    "Set points to 5.",
    ":::",
    ":::checkScript",
    'assert points == 5, "Set points to 5."',
    ":::",
    ":::",
  ].join("\n");
}

function cardsLesson(slug: string) {
  const draft: LessonDraft = {
    title: "Card lesson",
    slug,
    description: "First-year students practise one idea.",
    track: "Python",
    programmingLanguage: "Python",
    tags: ["sample"],
    version: 0,
    steps: [
      {
        id: "intro",
        title: "Introduction",
        blocks: [
          {
            ...defaults.text(),
            id: "keep-me",
            markdown: "KEEP THIS SENTENCE",
          },
          {
            ...defaults.text(),
            id: "change-me",
            markdown: "OLD CARD",
          },
        ],
      },
      {
        id: "next-step",
        title: "Next",
        blocks: [
          {
            ...defaults.text(),
            id: "22222222-2222-4222-8222-222222222222",
            markdown: "OTHER STEP SENTENCE",
          },
        ],
      },
    ],
  };
  return serializeLessonMarkdown(draft);
}

async function createCardsLesson(slug: string) {
  const ctx = context(staffUser);
  const markdown = cardsLesson(slug);
  const validated = await runPlannerTool("validate_lesson", { markdown }, ctx);
  expect(validated.ok).toBe(true);
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
  const lessonId = String(created.lessonId);
  const read = await runPlannerTool(
    "read_lesson",
    { courseId: courseA, lessonId },
    ctx,
  );
  expect(read.ok).toBe(true);
  return { ctx, lessonId, before: await draftOf(lessonId) };
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
    expect(plannerSystemPrompt()).toContain(
      "Staff can draft lessons, add a chapter, and move a lesson into a chapter on courses assigned to them.",
    );
    expect(plannerSystemPrompt()).not.toContain(
      "Only an admin can add a chapter",
    );
    expect(plannerSystemPrompt()).toContain(
      "Creating a chapter can mean an empty chapter with no lessons, or a chapter plus lessons inside it. When the teacher asks to create a chapter or add a chapter and has not already said which of those they want, ask a short clarifying question. Do not call create_chapter, create_lesson, or move_lesson yet. After they answer, do only what they chose. If the same message already says the chapter should be empty, or already names the lessons to include, proceed without asking again.",
    );
    const createChapter = plannerToolSchemas.find(
      (tool) => tool.function.name === "create_chapter",
    );
    expect(createChapter?.function.description).toContain(
      "If the teacher asked to create or add a chapter and has not already said which, ask a short clarifying question and do not call this tool, create_lesson, or move_lesson yet.",
    );
    expect(createChapter?.function.description).toContain(
      "If the same message already says empty or names the lessons, call this tool without asking again.",
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

  it("tells the model to edit one card without rewriting the lesson", () => {
    const prompt = plannerSystemPrompt();
    expect(prompt).toContain(markdownFieldPrompt);
    expect(prompt).toContain(
      "When the teacher asks to change, add, or remove one card, call read_lesson in this turn first so you have the card id and the step id.",
    );
    expect(prompt).toContain(
      "Use update_lesson only when the teacher wants a broad rewrite of the lesson.",
    );
    expect(prompt).toContain("update_card");
    expect(prompt).toContain("insert_card");
    expect(prompt).toContain("delete_card");
    const names = plannerToolSchemas.map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining(["update_card", "insert_card", "delete_card"]),
    );
    const updateCard = plannerToolSchemas.find(
      (tool) => tool.function.name === "update_card",
    );
    expect(JSON.stringify(updateCard)).toContain('"cardId"');
    expect(JSON.stringify(updateCard)).not.toContain("validationToken");
    expect(plannerReloadsLesson("update_card")).toBe(true);
    expect(plannerReloadsLesson("insert_card")).toBe(true);
    expect(plannerReloadsLesson("delete_card")).toBe(true);
    expect(plannerReloadsLesson("read_lesson")).toBe(false);
  });

  it("names the smaller edit tools and when to use them", () => {
    const prompt = plannerSystemPrompt();
    for (const name of [
      "move_card",
      "patch_card",
      "update_lesson_details",
      "restore_draft",
      "delete_lesson",
      "rename_chapter",
    ]) {
      expect(prompt).toContain(name);
      expect(
        plannerToolSchemas.some((tool) => tool.function.name === name),
      ).toBe(true);
    }
    expect(prompt).toContain("Use move_card instead of update_lesson");
    expect(prompt).toContain("Use patch_card instead of update_card");
    expect(prompt).toContain(
      "Use update_lesson_details instead of update_lesson",
    );
    expect(prompt).toContain("Use restore_draft instead of update_lesson");
    expect(prompt).toContain("Use rename_chapter instead of create_chapter");
    expect(prompt).toContain("A title change does not change the slug.");
    expect(prompt).toContain("It does not publish and it does not unarchive.");
    expect(prompt).toContain("it does not hard-delete it");
    expect(plannerReloadsLesson("move_card")).toBe(true);
    expect(plannerReloadsLesson("patch_card")).toBe(true);
    expect(plannerReloadsLesson("update_lesson_details")).toBe(true);
    expect(plannerReloadsLesson("restore_draft")).toBe(true);
    expect(plannerReloadsLesson("delete_lesson")).toBe(false);
    expect(plannerReloadsLesson("rename_chapter")).toBe(false);
    const patch = plannerToolSchemas.find(
      (tool) => tool.function.name === "patch_card",
    );
    expect(JSON.stringify(patch)).toContain('"fields"');
    expect(JSON.stringify(patch)).not.toContain("validationToken");
    const move = plannerToolSchemas.find(
      (tool) => tool.function.name === "move_card",
    );
    expect(JSON.stringify(move)).toContain('"stepId"');
    expect(JSON.stringify(move)).toContain('"position"');
    expect(JSON.stringify(move)).not.toContain("validationToken");
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
  it("lets staff read and edit an assigned course, add a chapter, and move a lesson", async () => {
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
    expect(chapter.ok).toBe(true);
    expect(
      (
        await db().query(
          "SELECT title FROM cms_chapters WHERE id=$1 AND course_id=$2",
          [chapter.chapterId, courseA],
        )
      ).rows[0],
    ).toMatchObject({ title: "Staff chapter" });
    const moved = await runPlannerTool(
      "move_lesson",
      {
        courseId: courseA,
        lessonId: lessonA,
        chapterId: chapter.chapterId,
      },
      ctx,
    );
    expect(moved.ok).toBe(true);
    expect((await lessonRow(courseA, "assigned-draft")).chapter_id).toBe(
      chapter.chapterId,
    );
  });

  it("forbids staff from adding a chapter or moving a lesson on an unassigned course", async () => {
    asUser(sessions.staff);
    const ctx = context(staffUser);
    const chapter = await runPlannerTool(
      "create_chapter",
      { courseId: courseB, title: "Foreign chapter" },
      ctx,
    );
    expect(chapter.ok).toBe(false);
    expect(chapter.error).toMatch(/access/i);
    expect(
      (
        await db().query("SELECT id FROM cms_chapters WHERE course_id=$1", [
          courseB,
        ])
      ).rowCount,
    ).toBe(0);
    const moved = await runPlannerTool(
      "move_lesson",
      { courseId: courseB, lessonId: lessonB, chapterId: "missing" },
      ctx,
    );
    expect(moved.ok).toBe(false);
    expect(moved.error).toMatch(/access/i);
    expect((await lessonRow(courseB, "private-draft")).chapter_id).toBeNull();
    await expect(
      editChapter(courseB, { title: "Foreign chapter", create: true }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(moveLesson(courseB, lessonB, null)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (
        await db().query("SELECT id FROM cms_chapters WHERE course_id=$1", [
          courseB,
        ])
      ).rowCount,
    ).toBe(0);
    expect((await lessonRow(courseB, "private-draft")).chapter_id).toBeNull();
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

describe("planner card edits", () => {
  it("updates one card and leaves the others intact", async () => {
    const { ctx, lessonId, before } =
      await createCardsLesson("card-update-lesson");
    const cold = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        markdown: textCard("renamed-card", "NEW CARD TEXT"),
      },
      context(staffUser),
    );
    expect(cold.ok).toBe(false);
    expect(cold.error).toMatch(/read_lesson/);
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);

    const updated = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        markdown: textCard("renamed-card", "NEW CARD TEXT"),
      },
      ctx,
    );
    expect(updated.ok).toBe(true);
    expect(updated.cardId).toBe("change-me");
    expect(plannerWriteChange("update_card", updated)).toEqual({
      action: "update_card",
      courseId: courseA,
      lessonId,
    });
    const after = await draftOf(lessonId);
    expect(after.steps.map((step) => step.id)).toEqual(
      before.steps.map((step) => step.id),
    );
    expect(after.steps[0].title).toBe(before.steps[0].title);
    expect(after.steps[0].blocks.map((block) => block.id)).toEqual([
      "keep-me",
      "change-me",
    ]);
    expect(after.steps[0].blocks[0]).toEqual(before.steps[0].blocks[0]);
    const changed = after.steps[0].blocks[1];
    expect(changed.id).toBe("change-me");
    expect(changed.type).toBe("text");
    if (changed.type === "text") expect(changed.markdown).toBe("NEW CARD TEXT");
    expect(after.steps[1]).toEqual(before.steps[1]);
    expect(after.title).toBe(before.title);
    expect(after.slug).toBe(before.slug);
    expect(after.description).toBe(before.description);
    expect(after.track).toBe(before.track);
    expect(after.programmingLanguage).toBe(before.programmingLanguage);
    expect(after.tags).toEqual(before.tags);
    expect(Number(after.version)).toBe(Number(before.version) + 1);
  });

  it("rejects an unknown card id and a card that fails validation", async () => {
    const { ctx, lessonId, before } =
      await createCardsLesson("card-reject-lesson");
    const missing = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "missing-card",
        markdown: textCard("missing-card", "Nope"),
      },
      ctx,
    );
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe("Unknown card id.");
    expect(plannerWriteChange("update_card", missing)).toBeNull();
    const invalid = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        markdown: [
          ':::mcq{id="change-me" visible=true multiple=false}',
          ":::question",
          "Pick one",
          ":::",
          ":::choices",
          ':::choice{id="only" correct=true}',
          "Only",
          ":::",
          ":::",
          ":::explanation",
          "Because",
          ":::",
          ":::",
        ].join("\n"),
      },
      ctx,
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toMatch(/not valid/);
    const whole = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        markdown: cardsLesson("not-stored"),
      },
      ctx,
    );
    expect(whole.ok).toBe(false);
    expect(whole.error).toMatch(/one card/);
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);
    expect(Number((await draftOf(lessonId)).version)).toBe(
      Number(before.version),
    );
  });

  it("forbids staff from editing a card on an unassigned course", async () => {
    const ctx = context(staffUser);
    const before = await draftOf(lessonB);
    const updated = await runPlannerTool(
      "update_card",
      {
        courseId: courseB,
        lessonId: lessonB,
        cardId: "private-text",
        markdown: textCard("private-text", "nope"),
      },
      ctx,
    );
    const inserted = await runPlannerTool(
      "insert_card",
      {
        courseId: courseB,
        lessonId: lessonB,
        stepId: "private-step",
        position: 0,
        markdown: textCard("extra-card", "nope"),
      },
      ctx,
    );
    const deleted = await runPlannerTool(
      "delete_card",
      {
        courseId: courseB,
        lessonId: lessonB,
        cardId: "private-text",
      },
      ctx,
    );
    for (const result of [updated, inserted, deleted]) {
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/access/i);
    }
    expect(await draftOf(lessonB)).toEqual(before);
    expect(JSON.stringify(updated)).not.toContain("SECRET-OTHER-COURSE");
  });

  it("inserts one card at a position and deletes one card by id", async () => {
    const { ctx, lessonId, before } =
      await createCardsLesson("card-insert-lesson");
    const collision = await runPlannerTool(
      "insert_card",
      {
        courseId: courseA,
        lessonId,
        stepId: "intro",
        position: 0,
        markdown: textCard("keep-me", "duplicate"),
      },
      ctx,
    );
    expect(collision.ok).toBe(false);
    expect(collision.error).toMatch(/already used/);
    const outside = await runPlannerTool(
      "insert_card",
      {
        courseId: courseA,
        lessonId,
        stepId: "intro",
        position: 9,
        markdown: textCard("added-note", "Between the cards."),
      },
      ctx,
    );
    expect(outside.ok).toBe(false);
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);

    const inserted = await runPlannerTool(
      "insert_card",
      {
        courseId: courseA,
        lessonId,
        stepId: "intro",
        position: 1,
        markdown: textCard("added-note", "Between the cards."),
      },
      ctx,
    );
    expect(inserted.ok).toBe(true);
    expect(inserted.cardId).toBe("added-note");
    expect(plannerWriteChange("insert_card", inserted)).toMatchObject({
      action: "insert_card",
      courseId: courseA,
      lessonId,
    });
    const midway = await draftOf(lessonId);
    expect(midway.steps[0].blocks.map((block) => block.id)).toEqual([
      "keep-me",
      "added-note",
      "change-me",
    ]);
    expect(midway.steps[0].blocks[0]).toEqual(before.steps[0].blocks[0]);
    expect(midway.steps[0].blocks[2]).toEqual(before.steps[0].blocks[1]);
    expect(midway.steps[1]).toEqual(before.steps[1]);
    const added = midway.steps[0].blocks[1];
    expect(added.type).toBe("text");
    if (added.type === "text")
      expect(added.markdown).toBe("Between the cards.");

    const generated = await runPlannerTool(
      "insert_card",
      {
        courseId: courseA,
        lessonId,
        stepId: "next-step",
        position: 1,
        markdown: textCard(undefined, "A new note."),
      },
      ctx,
    );
    expect(generated.ok).toBe(true);
    expect(generated.cardId).toBe("text");
    expect(generated.cardId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const withGenerated = await draftOf(lessonId);
    expect(withGenerated.steps[0].blocks.map((block) => block.id)).toEqual([
      "keep-me",
      "added-note",
      "change-me",
    ]);
    expect(withGenerated.steps[1].blocks.map((block) => block.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "text",
    ]);
    expect(withGenerated.steps[1].blocks[0]).toEqual(before.steps[1].blocks[0]);

    const removed = await runPlannerTool(
      "delete_card",
      { courseId: courseA, lessonId, cardId: "added-note" },
      ctx,
    );
    expect(removed.ok).toBe(true);
    expect(plannerWriteChange("delete_card", removed)).toMatchObject({
      action: "delete_card",
      lessonId,
    });
    const removedGenerated = await runPlannerTool(
      "delete_card",
      { courseId: courseA, lessonId, cardId: "text" },
      ctx,
    );
    expect(removedGenerated.ok).toBe(true);
    const unknown = await runPlannerTool(
      "delete_card",
      { courseId: courseA, lessonId, cardId: "missing-card" },
      ctx,
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toBe("Unknown card id.");
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);
  });

  it("keeps a newer editor save when a card edit is stale", async () => {
    const { ctx, lessonId } = await createCardsLesson("card-stale-lesson");
    const lesson = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonId])
    ).rows[0];
    const current = await loadRevision(db(), lesson, lesson.draft_revision_id);
    await persistDraft(
      courseA,
      lessonId,
      {
        ...current,
        title: "Saved in the editor",
        version: Number(lesson.version),
      },
      admin,
    );
    const stale = await runPlannerTool(
      "update_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        markdown: textCard("change-me", "TOO LATE"),
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    const kept = await draftOf(lessonId);
    expect(kept.title).toBe("Saved in the editor");
    const keptCard = kept.steps[0].blocks[1];
    expect(keptCard.type).toBe("text");
    if (keptCard.type === "text") expect(keptCard.markdown).toBe("OLD CARD");
  });
});

describe("planner structural edits", () => {
  it("moves one card across steps without duplicating or dropping cards", async () => {
    const { ctx, lessonId, before } = await createCardsLesson("card-move-lesson");
    const within = await runPlannerTool(
      "move_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        stepId: "intro",
        position: 0,
      },
      ctx,
    );
    expect(within.ok).toBe(true);
    const reordered = await draftOf(lessonId);
    expect(reordered.steps[0].blocks.map((block) => block.id)).toEqual([
      "change-me",
      "keep-me",
    ]);
    expect(reordered.steps[0].blocks[0]).toEqual(before.steps[0].blocks[1]);
    expect(reordered.steps[0].blocks[1]).toEqual(before.steps[0].blocks[0]);
    expect(reordered.steps[1]).toEqual(before.steps[1]);
    expect(reordered.steps.flatMap((step) => step.blocks)).toHaveLength(3);

    const moved = await runPlannerTool(
      "move_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        stepId: "next-step",
        position: 0,
      },
      ctx,
    );
    expect(moved.ok).toBe(true);
    expect(plannerWriteChange("move_card", moved)).toMatchObject({
      action: "move_card",
      courseId: courseA,
      lessonId,
    });
    const after = await draftOf(lessonId);
    expect(after.steps[0].blocks.map((block) => block.id)).toEqual(["keep-me"]);
    expect(after.steps[0].blocks[0]).toEqual(before.steps[0].blocks[0]);
    expect(after.steps[1].blocks.map((block) => block.id)).toEqual([
      "change-me",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(after.steps[1].blocks[0]).toEqual(before.steps[0].blocks[1]);
    expect(after.steps[1].blocks[1]).toEqual(before.steps[1].blocks[0]);
    const ids = after.steps.flatMap((step) => step.blocks.map((block) => block.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
    expect(after.title).toBe(before.title);
    expect(after.slug).toBe(before.slug);

    const version = Number(after.version);
    const missingCard = await runPlannerTool(
      "move_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "missing-card",
        stepId: "intro",
        position: 0,
      },
      ctx,
    );
    expect(missingCard.ok).toBe(false);
    expect(missingCard.error).toBe("Unknown card id.");
    const missingStep = await runPlannerTool(
      "move_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "keep-me",
        stepId: "missing-step",
        position: 0,
      },
      ctx,
    );
    expect(missingStep.ok).toBe(false);
    expect(missingStep.error).toBe("Unknown step id.");
    const kept = await draftOf(lessonId);
    expect(Number(kept.version)).toBe(version);
    expect(kept.steps).toEqual(after.steps);
  });

  it("returns 409 when a card move is stale", async () => {
    const { ctx, lessonId } = await createCardsLesson("card-move-stale");
    const lesson = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonId])
    ).rows[0];
    const current = await loadRevision(db(), lesson, lesson.draft_revision_id);
    await persistDraft(
      courseA,
      lessonId,
      {
        ...current,
        title: "Saved in the editor",
        version: Number(lesson.version),
      },
      admin,
    );
    const stale = await runPlannerTool(
      "move_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        stepId: "next-step",
        position: 0,
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe(409);
    const kept = await draftOf(lessonId);
    expect(kept.title).toBe("Saved in the editor");
    expect(kept.steps[0].blocks.map((block) => block.id)).toEqual([
      "keep-me",
      "change-me",
    ]);
  });

  it("patches one card field and leaves the code intact", async () => {
    const { ctx, lessonId, before } = await createCardsLesson(
      "card-patch-lesson",
    );
    const inserted = await runPlannerTool(
      "insert_card",
      {
        courseId: courseA,
        lessonId,
        stepId: "intro",
        position: 1,
        markdown: exerciseCard("score-exercise"),
      },
      ctx,
    );
    expect(inserted.ok).toBe(true);
    const seeded = await draftOf(lessonId);
    const exercise = seeded.steps[0].blocks[1];
    expect(exercise.type).toBe("code-exercise");

    const unknownField = await runPlannerTool(
      "patch_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "score-exercise",
        fields: { solutionNotes: "nope" },
      },
      ctx,
    );
    expect(unknownField.ok).toBe(false);
    expect(unknownField.error).toMatch(/Unknown card field/);
    const invalid = await runPlannerTool(
      "patch_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "score-exercise",
        fields: { language: "javascript" },
      },
      ctx,
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toMatch(/not valid/);
    const missing = await runPlannerTool(
      "patch_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "missing-card",
        fields: { instructions: "Nope" },
      },
      ctx,
    );
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe("Unknown card id.");
    expect((await draftOf(lessonId)).steps).toEqual(seeded.steps);

    const patched = await runPlannerTool(
      "patch_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "score-exercise",
        fields: { instructions: "Print the score after you set it." },
      },
      ctx,
    );
    expect(patched.ok).toBe(true);
    expect(patched.cardId).toBe("score-exercise");
    expect(plannerWriteChange("patch_card", patched)).toMatchObject({
      action: "patch_card",
      lessonId,
    });
    const after = await draftOf(lessonId);
    expect(after.steps[0].blocks.map((block) => block.id)).toEqual([
      "keep-me",
      "score-exercise",
      "change-me",
    ]);
    expect(after.steps[0].blocks[0]).toEqual(before.steps[0].blocks[0]);
    expect(after.steps[0].blocks[2]).toEqual(before.steps[0].blocks[1]);
    expect(after.steps[1]).toEqual(before.steps[1]);
    const updated = after.steps[0].blocks[1];
    expect(updated.type).toBe("code-exercise");
    if (updated.type === "code-exercise" && exercise.type === "code-exercise") {
      expect(updated.instructions).toBe("Print the score after you set it.");
      expect(updated.starterCode).toBe(exercise.starterCode);
      expect(updated.solution).toBe(exercise.solution);
      expect(updated.checkScript).toBe(exercise.checkScript);
      expect(updated.language).toBe(exercise.language);
      expect(updated.execution).toBe("browser");
      expect(updated.id).toBe("score-exercise");
    }
    expect(after.title).toBe(before.title);
    expect(after.slug).toBe(before.slug);
  });

  it("returns 409 when a card patch is stale", async () => {
    const { ctx, lessonId } = await createCardsLesson("card-patch-stale");
    const lesson = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonId])
    ).rows[0];
    const current = await loadRevision(db(), lesson, lesson.draft_revision_id);
    await persistDraft(
      courseA,
      lessonId,
      {
        ...current,
        title: "Saved in the editor",
        version: Number(lesson.version),
      },
      admin,
    );
    const stale = await runPlannerTool(
      "patch_card",
      {
        courseId: courseA,
        lessonId,
        cardId: "change-me",
        fields: { markdown: "TOO LATE" },
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe(409);
    const kept = await draftOf(lessonId);
    expect(kept.title).toBe("Saved in the editor");
    const keptCard = kept.steps[0].blocks[1];
    expect(keptCard.type).toBe("text");
    if (keptCard.type === "text") expect(keptCard.markdown).toBe("OLD CARD");
  });

  it("changes a lesson title without rewriting card bodies", async () => {
    const { ctx, lessonId, before } = await createCardsLesson(
      "card-details-lesson",
    );
    const taken = await createCardsLesson("taken-details-lesson");
    const invalid = await runPlannerTool(
      "update_lesson_details",
      {
        courseId: courseA,
        lessonId,
        slug: "Not A Slug",
      },
      ctx,
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toMatch(/slug/i);
    expect((await draftOf(lessonId)).slug).toBe(before.slug);
    expect(Number((await draftOf(lessonId)).version)).toBe(
      Number(before.version),
    );

    const renamed = await runPlannerTool(
      "update_lesson_details",
      {
        courseId: courseA,
        lessonId,
        title: "Renamed card lesson",
      },
      ctx,
    );
    expect(renamed.ok).toBe(true);
    expect(plannerWriteChange("update_lesson_details", renamed)).toMatchObject({
      action: "update_lesson_details",
      courseId: courseA,
      lessonId,
    });
    const titled = await draftOf(lessonId);
    expect(titled.title).toBe("Renamed card lesson");
    expect(titled.slug).toBe(before.slug);
    expect(titled.description).toBe(before.description);
    expect(titled.track).toBe(before.track);
    expect(titled.programmingLanguage).toBe(before.programmingLanguage);
    expect(titled.tags).toEqual(before.tags);
    expect(titled.steps).toEqual(before.steps);
    expect(renamed.href).toBe(
      "/courses/assigned-course/lessons/card-details-lesson/edit",
    );

    const collision = await runPlannerTool(
      "update_lesson_details",
      {
        courseId: courseA,
        lessonId,
        slug: "taken-details-lesson",
      },
      ctx,
    );
    expect(collision.ok).toBe(false);
    expect(collision.error).toMatch(/slug/i);
    expect((await draftOf(lessonId)).slug).toBe(before.slug);
    expect((await draftOf(taken.lessonId)).steps).toEqual(taken.before.steps);

    const reslugged = await runPlannerTool(
      "update_lesson_details",
      {
        courseId: courseA,
        lessonId,
        slug: "renamed-card-lesson",
      },
      ctx,
    );
    expect(reslugged.ok).toBe(true);
    expect(reslugged.href).toBe(
      "/courses/assigned-course/lessons/renamed-card-lesson/edit",
    );
    const after = await draftOf(lessonId);
    expect(after.slug).toBe("renamed-card-lesson");
    expect(after.title).toBe("Renamed card lesson");
    expect(after.description).toBe(before.description);
    expect(after.steps).toEqual(before.steps);

    await persistDraft(
      courseA,
      lessonId,
      {
        ...after,
        title: "Saved in the editor",
        version: Number(after.version),
      },
      admin,
    );
    const stale = await runPlannerTool(
      "update_lesson_details",
      {
        courseId: courseA,
        lessonId,
        title: "Too late",
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe(409);
    const kept = await draftOf(lessonId);
    expect(kept.title).toBe("Saved in the editor");
    expect(kept.steps).toEqual(before.steps);
  });

  it("restores a published snapshot onto the draft and does not publish", async () => {
    const { ctx, lessonId, before } = await createCardsLesson(
      "restore-draft-lesson",
    );
    const first = await publishRevision(
      courseA,
      lessonId,
      { ...before, title: "Snapshot one", version: Number(before.version) },
      admin,
    );
    let current = await draftOf(lessonId);
    const second = await publishRevision(
      courseA,
      lessonId,
      {
        ...current,
        title: "Snapshot two",
        version: Number(current.version),
        steps: current.steps.map((step) => ({
          ...step,
          blocks: step.blocks.map((block) =>
            block.id === "change-me" && block.type === "text"
              ? { ...block, markdown: "SECOND SNAPSHOT" }
              : block,
          ),
        })),
      },
      admin,
    );
    current = await draftOf(lessonId);
    await persistDraft(
      courseA,
      lessonId,
      {
        ...current,
        title: "Working draft",
        version: Number(current.version),
        steps: current.steps.map((step) => ({
          ...step,
          blocks: step.blocks.map((block) =>
            block.id === "change-me" && block.type === "text"
              ? { ...block, markdown: "WORKING DRAFT" }
              : block,
          ),
        })),
      },
      admin,
    );
    const cold = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseA,
        lessonId,
        revisionId: first.revisionId,
      },
      ctx,
    );
    expect(cold.ok).toBe(false);
    expect((await draftOf(lessonId)).title).toBe("Working draft");

    const read = await runPlannerTool(
      "read_lesson",
      { courseId: courseA, lessonId },
      ctx,
    );
    expect(read.ok).toBe(true);
    expect(read.revisions.map((revision: { id: string }) => revision.id)).toEqual([
      second.revisionId,
      first.revisionId,
    ]);
    const unknown = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseA,
        lessonId,
        revisionId: "missing-revision",
      },
      ctx,
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toMatch(/no longer available/);
    expect((await draftOf(lessonId)).title).toBe("Working draft");
    const workingCard = (await draftOf(lessonId)).steps[0].blocks[1];
    expect(workingCard.type).toBe("text");
    if (workingCard.type === "text")
      expect(workingCard.markdown).toBe("WORKING DRAFT");

    const restored = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseA,
        lessonId,
        revisionId: first.revisionId,
      },
      ctx,
    );
    expect(restored.ok).toBe(true);
    expect(restored.title).toBe("Snapshot one");
    expect(plannerWriteChange("restore_draft", restored)).toMatchObject({
      action: "restore_draft",
      courseId: courseA,
      lessonId,
    });
    const draft = await draftOf(lessonId);
    expect(draft.title).toBe("Snapshot one");
    const restoredCard = draft.steps[0].blocks[1];
    expect(restoredCard.type).toBe("text");
    if (restoredCard.type === "text")
      expect(restoredCard.markdown).toBe("OLD CARD");
    expect(draft.steps[0].blocks[0]).toEqual(before.steps[0].blocks[0]);
    expect(draft.steps[1]).toEqual(before.steps[1]);
    const row = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lessonId])
    ).rows[0];
    expect(row.status).toBe("published");
    expect(row.published_revision_id).toBe(second.revisionId);
    const published = await loadRevision(db(), row, second.revisionId);
    expect(published.title).toBe("Snapshot two");
    const publishedCard = published.steps[0].blocks[1];
    expect(publishedCard.type).toBe("text");
    if (publishedCard.type === "text")
      expect(publishedCard.markdown).toBe("SECOND SNAPSHOT");
    expect(
      (
        await db().query(
          "SELECT id FROM cms_lesson_revisions WHERE lesson_id=$1 AND state='published'",
          [lessonId],
        )
      ).rowCount,
    ).toBe(2);

    await persistDraft(
      courseA,
      lessonId,
      {
        ...draft,
        title: "Saved in the editor",
        version: Number(draft.version),
      },
      admin,
    );
    const stale = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseA,
        lessonId,
        revisionId: first.revisionId,
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe(409);
    expect((await draftOf(lessonId)).title).toBe("Saved in the editor");

    asUser(sessions.admin);
    const archived = await runPlannerTool(
      "delete_lesson",
      { courseId: courseA, lessonId },
      context(adminUser),
    );
    expect(archived.ok).toBe(true);
    const staffCtx = context(staffUser);
    const reread = await runPlannerTool(
      "read_lesson",
      { courseId: courseA, lessonId },
      staffCtx,
    );
    expect(reread.ok).toBe(true);
    const broughtBack = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseA,
        lessonId,
        revisionId: first.revisionId,
      },
      staffCtx,
    );
    expect(broughtBack.ok).toBe(true);
    const afterArchive = (
      await db().query(
        "SELECT status, published_revision_id FROM cms_lessons WHERE id=$1",
        [lessonId],
      )
    ).rows[0];
    expect(afterArchive.status).toBe("archived");
    expect(afterArchive.published_revision_id).toBeNull();
    expect((await draftOf(lessonId)).title).toBe("Snapshot one");

    const denied = await runPlannerTool(
      "restore_draft",
      {
        courseId: courseB,
        lessonId: lessonB,
        revisionId: "missing-revision",
      },
      context(staffUser),
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/access/i);
    expect(JSON.stringify(denied)).not.toContain("SECRET-OTHER-COURSE");
  });

  it("archives a lesson and renames a chapter for an allowed user", async () => {
    asUser(sessions.staff);
    const staffCtx = context(staffUser);
    const created = await runPlannerTool(
      "create_chapter",
      { courseId: courseA, title: "Old chapter" },
      staffCtx,
    );
    expect(created.ok).toBe(true);
    const renamed = await runPlannerTool(
      "rename_chapter",
      {
        courseId: courseA,
        chapterId: created.chapterId,
        title: "New chapter",
      },
      staffCtx,
    );
    expect(renamed.ok).toBe(true);
    expect(plannerWriteChange("rename_chapter", renamed)).toEqual({
      action: "rename_chapter",
      courseId: courseA,
      lessonId: undefined,
    });
    expect(
      (
        await db().query("SELECT title FROM cms_chapters WHERE id=$1", [
          created.chapterId,
        ])
      ).rows[0].title,
    ).toBe("New chapter");

    const { lessonId, before } = await createCardsLesson("archive-me-lesson");
    const staffDelete = await runPlannerTool(
      "delete_lesson",
      { courseId: courseA, lessonId },
      staffCtx,
    );
    expect(staffDelete.ok).toBe(false);
    expect(staffDelete.error).toMatch(/admin/i);
    expect(
      (
        await db().query("SELECT status FROM cms_lessons WHERE id=$1", [
          lessonId,
        ])
      ).rows[0].status,
    ).toBe("draft");
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);

    asUser(sessions.admin);
    const removed = await runPlannerTool(
      "delete_lesson",
      { courseId: courseA, lessonId },
      context(adminUser),
    );
    expect(removed.ok).toBe(true);
    expect(removed.archived).toBe(true);
    expect(plannerWriteChange("delete_lesson", removed)).toMatchObject({
      action: "delete_lesson",
      courseId: courseA,
      lessonId,
    });
    const row = (
      await db().query(
        "SELECT id, status, published_revision_id FROM cms_lessons WHERE id=$1",
        [lessonId],
      )
    ).rows[0];
    expect(row.status).toBe("archived");
    expect(row.published_revision_id).toBeNull();
    expect((await draftOf(lessonId)).steps).toEqual(before.steps);

    const deniedRename = await runPlannerTool(
      "rename_chapter",
      {
        courseId: courseB,
        chapterId: created.chapterId,
        title: "Stolen",
      },
      context(staffUser),
    );
    expect(deniedRename.ok).toBe(false);
    expect(deniedRename.error).toMatch(/access/i);
    const deniedDelete = await runPlannerTool(
      "delete_lesson",
      { courseId: courseB, lessonId: lessonB },
      context(staffUser),
    );
    expect(deniedDelete.ok).toBe(false);
    expect(deniedDelete.error).toMatch(/access/i);
    expect(
      (
        await db().query("SELECT title FROM cms_chapters WHERE id=$1", [
          created.chapterId,
        ])
      ).rows[0].title,
    ).toBe("New chapter");
    expect(
      (
        await db().query("SELECT status FROM cms_lessons WHERE id=$1", [
          lessonB,
        ])
      ).rows[0].status,
    ).not.toBe("archived");

    asUser(sessions.admin);
    const lessonsBefore = (
      await db().query("SELECT id FROM cms_lessons WHERE course_id=$1", [
        courseA,
      ])
    ).rowCount;
    const missingLesson = await runPlannerTool(
      "delete_lesson",
      { courseId: courseA, lessonId: "missing-lesson" },
      context(adminUser),
    );
    expect(missingLesson.ok).toBe(false);
    expect(missingLesson.error).toBe("Lesson not found");
    expect(
      (
        await db().query("SELECT id FROM cms_lessons WHERE course_id=$1", [
          courseA,
        ])
      ).rowCount,
    ).toBe(lessonsBefore);
    const missingChapter = await runPlannerTool(
      "rename_chapter",
      {
        courseId: courseA,
        chapterId: "missing-chapter",
        title: "Nope",
      },
      context(adminUser),
    );
    expect(missingChapter.ok).toBe(false);
    expect(missingChapter.error).toBe("Chapter not found");
    expect(
      (await db().query("SELECT id FROM cms_chapters WHERE title=$1", ["Nope"]))
        .rowCount,
    ).toBe(0);
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
  it("keeps attachment names out of ordinary messages and reports saved outline writes", () => {
    expect(readMessageAttachments("Add a lesson about loops.")).toEqual({
      content: "Add a lesson about loops.",
      attachments: [],
    });
    expect(messageWithAttachments("Add a lesson", [])).toBe("Add a lesson");
    expect(
      readMessageAttachments(
        messageWithAttachments("Use this", ['week "1".txt', "notes.md"]),
      ),
    ).toEqual({
      content: "Use this",
      attachments: ['week "1".txt', "notes.md"],
    });
    expect(
      plannerWriteChange("create_chapter", {
        ok: true,
        courseId: courseA,
        chapterId: "chapter-1",
      }),
    ).toEqual({
      action: "create_chapter",
      courseId: courseA,
      lessonId: undefined,
    });
    expect(
      plannerWriteChange("move_lesson", {
        ok: true,
        courseId: courseA,
        lessonId: lessonA,
      }),
    ).toEqual({
      action: "move_lesson",
      courseId: courseA,
      lessonId: lessonA,
    });
    expect(
      plannerWriteChange("update_lesson", {
        ok: false,
        courseId: courseA,
        lessonId: lessonA,
      }),
    ).toBeNull();
    expect(
      plannerWriteChange("read_lesson", {
        ok: true,
        courseId: courseA,
        lessonId: lessonA,
      }),
    ).toBeNull();
  });

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
    const changed = events.find((event) => event.type === "changed");
    expect(changed?.change).toMatchObject({
      action: "create_lesson",
      courseId: courseA,
    });
    expect(changed?.change?.lessonId).toEqual(expect.any(String));
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
    const skippedEvents = (await response.text())
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(skippedEvents.some((event) => event.type === "changed")).toBe(false);
    expect(await lessonRow(courseA, "skipped-lesson")).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("stores attachment filenames on the user message and omits them from the model transcript", async () => {
    asUser(sessions.staff);
    const form = new FormData();
    form.set(
      "file",
      new File(["Week notes"], "week-notes.txt", { type: "text/plain" }),
    );
    const uploaded = await upload(
      new Request("http://localhost:3000/api/planner/attachments", {
        method: "POST",
        body: form,
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(uploaded.status).toBe(201);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body));
        const spoken = sent.messages.filter(
          (message: { role: string }) => message.role === "user",
        );
        expect(spoken.at(-1).content).toBe("Please use the attached notes.");
        expect(JSON.stringify(spoken)).not.toContain("[[attachments:");
        return modelReply({ content: "I see the notes." });
      }),
    );
    const response = await chat(
      jsonRequest("http://localhost:3000/api/planner/chat", {
        message: "Please use the attached notes.",
        path: "/courses/assigned-course",
      }),
    );
    expect(response.status).toBe(200);
    await response.text();
    const stored = (
      await db().query<{ content: string }>(
        "SELECT content FROM cms_planner_messages WHERE role='user' AND thread_id IN (SELECT id FROM cms_planner_threads WHERE profile_id=$1) ORDER BY position DESC LIMIT 1",
        [staff],
      )
    ).rows[0];
    expect(readMessageAttachments(stored.content)).toEqual({
      content: "Please use the attached notes.",
      attachments: ["week-notes.txt"],
    });
    vi.unstubAllGlobals();
  });
});
