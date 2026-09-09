import crypto from "node:crypto";
import { parseLessonMarkdown } from "./markdown";
import {
  db,
  arrayRead,
  arrayValue,
  isSqlite,
  type Queryable,
  type Row,
} from "./db";
import {
  LessonSchema,
  type LessonDraft,
  type Block,
  validateDraft,
} from "./content";
export class CmsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const uid = () => crypto.randomUUID();
// A field mapping for each normalized detail table, never a generic block payload.
export const detail: Record<
  Block["type"],
  { table: string; fields: Record<string, string> }
> = {
  text: { table: "rich_text", fields: { markdown: "markdown" } },
  task: {
    table: "task",
    fields: { statement: "statement", context: "context" },
  },
  "quick-reference": {
    table: "quick_reference",
    fields: { title: "title", markdown: "markdown" },
  },
  "worked-example": {
    table: "worked_example",
    fields: {
      title: "title",
      language: "language",
      code: "code",
      explanation: "explanation",
      runnable: "runnable",
      expectedOutput: "expected_output",
    },
  },
  figure: {
    table: "figure",
    fields: {
      imageUrl: "image_url",
      alt: "alt_text",
      caption: "caption",
      markdown: "markdown",
    },
  },
  mcq: {
    table: "mcq",
    fields: {
      question: "question",
      multiple: "multiple",
      explanation: "explanation",
    },
  },
  "code-exercise": {
    table: "code_exercise",
    fields: {
      language: "language",
      starterCode: "starter_code",
      solution: "solution",
      execution: "execution",
      prompt: "prompt",
      checkScript: "check_script",
      styleConfig: "style_config",
      randomisation: "randomisation",
      reviewPrinciples: "review_principles",
      expectedOutput: "expected_output",
    },
  },
  reflection: { table: "reflection", fields: { prompt: "prompt" } },
  "tutor-config": {
    table: "tutor_config",
    fields: {
      mode: "mode",
      chips: "chips",
      constraints: "constraints",
      llmAllowed: "llm_allowed",
      copyingAllowed: "copying_allowed",
    },
  },
  "data-asset": {
    table: "data_asset",
    fields: {
      url: "public_url",
      filename: "filename",
      runtimePath: "runtime_path",
      description: "description",
    },
  },
  "code-review": {
    table: "code_review",
    fields: {
      title: "title",
      purpose: "purpose",
      mechanism: "mechanism",
      output: "output",
      keyIdeas: "key_ideas",
      misconceptions: "misconceptions",
      variants: "acceptable_variants",
    },
  },
};
const listFields = new Set([
  "chips",
  "reviewPrinciples",
  "keyIdeas",
  "misconceptions",
  "variants",
]);
const boolFields = new Set([
  "runnable",
  "multiple",
  "llmAllowed",
  "copyingAllowed",
]);
function encode(key: string, value: any) {
  if (listFields.has(key)) return arrayValue([value ?? ""]);
  if (key === "styleConfig" || key === "randomisation")
    return JSON.stringify({ text: value ?? "" });
  return value ?? null;
}
function decode(key: string, value: any) {
  if (listFields.has(key)) return arrayRead(value).join("\n");
  if (key === "styleConfig" || key === "randomisation") {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    return v?.text ?? "";
  }
  if (boolFields.has(key)) return Boolean(value);
  return value;
}
async function insert(c: Queryable, table: string, row: Row) {
  const cols = Object.keys(row);
  await c.query(
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})`,
    Object.values(row),
  );
}
export async function writeRevision(
  c: Queryable,
  revision: string,
  draft: LessonDraft,
  userId: string,
) {
  await c.query("DELETE FROM cms_lesson_steps WHERE revision_id=$1", [
    revision,
  ]);
  await c.query("DELETE FROM cms_revision_metadata WHERE revision_id=$1", [
    revision,
  ]);
  await insert(c, "cms_revision_metadata", {
    revision_id: revision,
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    track: draft.track,
    level: draft.level,
    mode: draft.mode,
    programming_language: draft.programmingLanguage,
    tags: JSON.stringify(draft.tags),
    presentation: draft.presentation,
    runtime_scope: draft.runtimeScope,
    source_markdown: draft.sourceMarkdown ?? "",
  });
  for (const [si, s] of draft.steps.entries()) {
    const sid = uid();
    await insert(c, "cms_lesson_steps", {
      id: sid,
      revision_id: revision,
      stable_key: s.id,
      title: s.title,
      position: si,
    });
    for (const [bi, b] of s.blocks.entries()) {
      const bid = uid();
      await insert(c, "cms_content_blocks", {
        id: bid,
        stable_id: b.id,
        revision_id: revision,
        step_id: sid,
        block_type: b.type,
        position: bi,
        visible: b.visible,
        advanced: b.advanced ?? false,
        created_by: userId,
        updated_by: userId,
      });
      const spec = detail[b.type],
        row: Row = { block_id: bid };
      for (const [key, col] of Object.entries(spec.fields))
        row[col] = encode(key, (b as any)[key]);
      await insert(c, `cms_${spec.table}_blocks`, row);
      if (b.type === "task")
        for (const [i, f] of b.functions.entries())
          await insert(c, "cms_function_references", {
            id: uid(),
            task_block_id: bid,
            name: f.name,
            summary: f.summary,
            position: i,
          });
      if (b.type === "mcq")
        for (const [i, o] of b.choices.entries())
          await insert(c, "cms_mcq_options", {
            id: uid(),
            stable_id: o.id,
            mcq_block_id: bid,
            text: o.text,
            is_correct: o.correct,
            position: i,
          });
      if (b.type === "reflection")
        await insert(c, "cms_reflection_rubrics", {
          id: uid(),
          reflection_block_id: bid,
          key_ideas: arrayValue([b.rubric.keyIdeas]),
          misconceptions: arrayValue([b.rubric.misconceptions]),
          acceptable_variants: arrayValue([b.rubric.variants]),
        });
    }
  }
}
export async function loadRevision(
  c: Queryable,
  lesson: Row,
  revision: string,
): Promise<LessonDraft> {
  const meta =
    (
      await c.query(
        "SELECT * FROM cms_revision_metadata WHERE revision_id=$1",
        [revision],
      )
    ).rows[0] ?? lesson;
  const steps = (
    await c.query(
      "SELECT * FROM cms_lesson_steps WHERE revision_id=$1 ORDER BY position",
      [revision],
    )
  ).rows;
  const draft: LessonDraft = {
    title: meta.title,
    slug: meta.slug,
    description: meta.description,
    track: meta.track,
    level: meta.level,
    mode: meta.mode,
    programmingLanguage: meta.programming_language ?? "",
    tags: arrayRead(meta.tags),
    presentation: meta.presentation,
    runtimeScope: meta.runtime_scope,
    sourceMarkdown: meta.source_markdown ?? "",
    version: lesson.version ?? 0,
    steps: [],
  };
  for (const step of steps) {
    const blocks: Block[] = [];
    for (const row of (
      await c.query(
        "SELECT * FROM cms_content_blocks WHERE step_id=$1 AND deleted_at IS NULL ORDER BY position",
        [step.id],
      )
    ).rows) {
      const spec = detail[row.block_type as Block["type"]];
      if (!spec) throw new Error(`Unknown block type ${row.block_type}`);
      const value = (
        await c.query(
          `SELECT * FROM cms_${spec.table}_blocks WHERE block_id=$1`,
          [row.id],
        )
      ).rows[0];
      if (!value) throw new Error(`Missing typed detail for ${row.id}`);
      const b: any = {
        id: row.stable_id,
        type: row.block_type,
        visible: !!row.visible,
        advanced: !!row.advanced,
      };
      for (const [key, col] of Object.entries(spec.fields))
        if (value[col] !== null) b[key] = decode(key, value[col]);
      if (b.type === "task")
        b.functions = (
          await c.query(
            "SELECT name,summary FROM cms_function_references WHERE task_block_id=$1 ORDER BY position",
            [row.id],
          )
        ).rows;
      if (b.type === "mcq")
        b.choices = (
          await c.query(
            "SELECT * FROM cms_mcq_options WHERE mcq_block_id=$1 ORDER BY position",
            [row.id],
          )
        ).rows.map((o) => ({
          id: o.stable_id || o.id,
          text: o.text,
          correct: !!o.is_correct,
        }));
      if (b.type === "reflection") {
        const r = (
          await c.query(
            "SELECT * FROM cms_reflection_rubrics WHERE reflection_block_id=$1",
            [row.id],
          )
        ).rows[0];
        b.rubric = {
          keyIdeas: arrayRead(r?.key_ideas).join("\n"),
          misconceptions: arrayRead(r?.misconceptions).join("\n"),
          variants: arrayRead(r?.acceptable_variants).join("\n"),
        };
      }
      blocks.push(b);
    }
    draft.steps.push({ id: step.stable_key, title: step.title, blocks });
  }
  return LessonSchema.parse(draft);
}
async function lockedLesson(c: Queryable, courseId: string, lessonId: string) {
  const l = (
    await c.query(
      "SELECT * FROM cms_lessons WHERE id=$1 AND course_id=$2" +
        (isSqlite() ? "" : " FOR UPDATE"),
      [lessonId, courseId],
    )
  ).rows[0];
  if (!l) throw new CmsError(404, "Lesson not found");
  return l;
}
async function save(
  c: Queryable,
  courseId: string,
  lessonId: string,
  input: LessonDraft,
  userId: string,
) {
  const draft = LessonSchema.parse(input),
    l = await lockedLesson(c, courseId, lessonId);
  if (draft.version !== l.version)
    throw new CmsError(
      409,
      "This lesson changed. Reload before saving to avoid overwriting another editor.",
    );
  const rev = (
    await c.query("SELECT immutable FROM cms_lesson_revisions WHERE id=$1", [
      l.draft_revision_id,
    ])
  ).rows[0];
  if (rev?.immutable) throw new CmsError(409, "Draft revision is immutable.");
  await writeRevision(c, l.draft_revision_id, draft, userId);
  await c.query(
    "UPDATE cms_lessons SET title=$1,slug=$2,description=$3,track=$4,level=$5,mode=$6,programming_language=$7,tags=$8,presentation=$9,runtime_scope=$10,updated_by=$11,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$12",
    [
      draft.title,
      draft.slug,
      draft.description,
      draft.track,
      draft.level,
      draft.mode,
      draft.programmingLanguage,
      arrayValue(draft.tags),
      draft.presentation,
      draft.runtimeScope,
      userId,
      lessonId,
    ],
  );
  await c.query(
    "UPDATE cms_lesson_revisions SET updated_at=CURRENT_TIMESTAMP WHERE id=$1",
    [l.draft_revision_id],
  );
  return {
    ok: true,
    version: l.version + 1,
    errors: validateDraft(draft),
    savedAt: new Date().toISOString(),
    editor: userId,
  };
}
export const persistDraft = (
  courseId: string,
  lessonId: string,
  draft: LessonDraft,
  userId: string,
) => db().transaction((c) => save(c, courseId, lessonId, draft, userId));
export async function publishRevision(
  courseId: string,
  lessonId: string,
  draft: LessonDraft,
  userId: string,
) {
  const errors = validateDraft(draft);
  if (draft.sourceMarkdown)
    errors.push(
      ...parseLessonMarkdown(draft.sourceMarkdown, draft).errors.map(
        (e) => `Line ${e.line}: ${e.message}`,
      ),
    );
  if (errors.length) throw new CmsError(400, errors.join("\n"));
  return db().transaction(async (c) => {
    const result = await save(c, courseId, lessonId, draft, userId),
      rid = uid();
    const n = (
      await c.query(
        "SELECT max(revision_number) n FROM cms_lesson_revisions WHERE lesson_id=$1",
        [lessonId],
      )
    ).rows[0].n;
    await insert(c, "cms_lesson_revisions", {
      id: rid,
      lesson_id: lessonId,
      revision_number: Number(n) + 1,
      state: "published",
      immutable: true,
      created_by: userId,
    });
    await writeRevision(c, rid, draft, userId);
    await c.query(
      "UPDATE cms_courses SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
      [courseId],
    );
    await c.query(
      "UPDATE cms_lessons SET published_revision_id=$1,status='published' WHERE id=$2",
      [rid, lessonId],
    );
    return { ...result, revisionId: rid };
  });
}
export async function publishedLesson(courseId: string, lessonId: string) {
  const l = (
    await db().query(
      "SELECT l.* FROM cms_lessons l JOIN cms_courses c ON c.id=l.course_id WHERE l.id=$1 AND l.course_id=$2 AND l.published_revision_id IS NOT NULL AND l.status='published' AND c.status='published'",
      [lessonId, courseId],
    )
  ).rows[0];
  if (!l) throw new CmsError(404, "Published lesson not found");
  return publicDraft(await loadRevision(db(), l, l.published_revision_id));
}
export function publicDraft(draft: LessonDraft): LessonDraft {
  return {
    ...draft,
    version: undefined,
    sourceMarkdown: "",
    steps: draft.steps.map((s) => ({
      ...s,
      blocks: s.blocks
        .filter(
          (b) =>
            b.visible && b.type !== "tutor-config" && b.type !== "code-review",
        )
        .map((b) => {
          if (b.type === "code-exercise")
            return {
              ...b,
              solution: undefined,
              checkScript: undefined,
              reviewPrinciples: "",
              styleConfig: "",
              randomisation: "",
            };
          if (b.type === "reflection")
            return {
              ...b,
              rubric: { keyIdeas: "", misconceptions: "", variants: "" },
            };
          return b;
        }),
    })),
  };
}
