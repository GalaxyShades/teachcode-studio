import { z } from "zod";

export const CONTENT_API_VERSION = 1 as const;
// Explicit allowlists: adding an authoring field must never expose it publicly.
const id = z.string().min(1);
const base = { id, visible: z.literal(true), advanced: z.boolean().optional() };
const language = z.enum(["python", "r"]);
export const PublicBlockSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), markdown: z.string() }),
  z.object({
    ...base,
    type: z.literal("task"),
    statement: z.string(),
    context: z.string(),
    functions: z.array(z.object({ name: z.string(), summary: z.string() })),
  }),
  z.object({
    ...base,
    type: z.literal("quick-reference"),
    title: z.string(),
    markdown: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("worked-example"),
    title: z.string().optional(),
    language,
    code: z.string(),
    explanation: z.string(),
    runnable: z.boolean(),
    expectedOutput: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("figure"),
    imageUrl: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
    markdown: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("mcq"),
    question: z.string(),
    multiple: z.boolean(),
    choices: z
      .array(z.object({ id, text: z.string(), correct: z.boolean() }))
      .min(2),
    explanation: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("code-exercise"),
    language,
    starterCode: z.string(),
    execution: z.enum(["browser", "server"]),
    prompt: z.string(),
    expectedOutput: z.string().optional(),
    styleConfig: z.literal(""),
    randomisation: z.literal(""),
    reviewPrinciples: z.literal(""),
  }),
  z.object({
    ...base,
    type: z.literal("reflection"),
    prompt: z.string(),
    rubric: z.object({
      keyIdeas: z.literal(""),
      misconceptions: z.literal(""),
      variants: z.literal(""),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("data-asset"),
    url: z.string(),
    filename: z.string(),
    runtimePath: z.string().optional(),
    description: z.string(),
  }),
]);
export const PublicDraftSchema = z.object({
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  track: z.enum(["Python", "R", "literacy"]),
  level: z.enum(["year 1", "year 2", "advanced"]),
  mode: z.enum(["lesson", "exercise", "quiz"]),
  programmingLanguage: z.enum(["Python", "R", ""]),
  tags: z.array(z.string()),
  presentation: z.string(),
  runtimeScope: z.enum(["per-step", "lesson-wide"]),
  sourceMarkdown: z.literal(""),
  steps: z
    .array(
      z.object({ id, title: z.string(), blocks: z.array(PublicBlockSchema) }),
    )
    .min(1),
});
// The renderer uses empty author-field placeholders internally; the wire format omits them.
const blocks = PublicBlockSchema.options;
export const ContentBlockSchema = z.discriminatedUnion("type", [
  blocks[0],
  blocks[1],
  blocks[2],
  blocks[3],
  blocks[4],
  blocks[5],
  blocks[6].omit({
    styleConfig: true,
    randomisation: true,
    reviewPrinciples: true,
  }),
  blocks[7].omit({ rubric: true }),
  blocks[8],
]);
export const PublicChapterSchema = PublicDraftSchema.omit({
  sourceMarkdown: true,
}).extend({
  steps: z
    .array(
      z.object({ id, title: z.string(), blocks: z.array(ContentBlockSchema) }),
    )
    .min(1),
  apiVersion: z.literal(CONTENT_API_VERSION),
  courseId: id,
  chapterId: id,
  revisionId: id,
});
export type PublicChapter = z.infer<typeof PublicChapterSchema>;
export const CourseSummarySchema = z.object({
  id,
  slug: z.string(),
  title: z.string(),
  description: z.string(),
});
export const CourseListSchema = z.array(CourseSummarySchema);
export const ChapterSummarySchema = z.object({
  id,
  lessonId: id.nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  revisionId: id,
  contentUrl: z.string(),
});
export const CourseOutlineSchema = CourseSummarySchema.extend({
  lessons: z.array(
    z.object({
      id,
      title: z.string(),
      chapters: z.array(ChapterSummarySchema),
    }),
  ),
  unassignedChapters: z.array(ChapterSummarySchema),
});
export const PublicErrorSchema = z.object({
  error: z.string(),
  code: z.enum(["INVALID_ID", "PUBLISHED_CONTENT_NOT_FOUND", "INTERNAL_ERROR"]),
});
