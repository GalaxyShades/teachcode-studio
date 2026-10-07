import { z } from "zod";
export const blockTypes = [
  "text",
  "task",
  "quick-reference",
  "worked-example",
  "figure",
  "mcq",
  "code-exercise",
  "reflection",
  "data-asset",
] as const;
export type BlockType = (typeof blockTypes)[number];
const base = z.object({
  id: z.string().min(1),
  type: z.enum(blockTypes),
  visible: z.boolean().default(true),
  advanced: z.boolean().optional(),
});
export const BlockSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("text"), markdown: z.string() }),
  base.extend({
    type: z.literal("task"),
    statement: z.string(),
    context: z.string().default(""),
    functions: z
      .array(z.object({ name: z.string(), summary: z.string() }))
      .default([]),
  }),
  base.extend({
    type: z.literal("quick-reference"),
    title: z.string(),
    markdown: z.string(),
  }),
  base.extend({
    type: z.literal("worked-example"),
    title: z.string().optional(),
    language: z.enum(["python", "r"]),
    code: z.string(),
    explanation: z.string(),
    runnable: z.boolean(),
    expectedOutput: z.string().optional(),
  }),
  base.extend({
    type: z.literal("figure"),
    imageUrl: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
    markdown: z.string(),
  }),
  base.extend({
    type: z.literal("mcq"),
    question: z.string(),
    multiple: z.boolean(),
    choices: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string(),
          correct: z.boolean(),
        }),
      )
      .min(2),
    explanation: z.string(),
  }),
  base.extend({
    type: z.literal("code-exercise"),
    language: z.enum(["python", "r"]),
    starterCode: z.string(),
    solution: z.string().optional(),
    execution: z.enum(["browser", "server"]),
    instructions: z.string(),
    checkScript: z.string().optional(),
    expectedOutput: z.string().optional(),
    additionalPenalties: z.string().optional(),
    ignoredIssues: z.string().optional(),
  }),
  base.extend({
    type: z.literal("reflection"),
    prompt: z.string(),
    rubric: z.object({
      keyIdeas: z.string(),
      misconceptions: z.string(),
      variants: z.string(),
    }),
  }),
  base.extend({
    type: z.literal("data-asset"),
    url: z.string(),
    filename: z.string(),
    runtimePath: z.string().optional(),
    description: z.string(),
  }),
]);
export const AssistantSchema = z.object({
  suggestedQuestions: z.string(),
  constraints: z.string(),
});
export type AssistantSettings = z.infer<typeof AssistantSchema>;
export function emptyAssistant(): AssistantSettings {
  return {
    suggestedQuestions: "",
    constraints: "",
  };
}
export type Block = z.infer<typeof BlockSchema>;
export type Step = { id: string; title: string; blocks: Block[] };
export const LessonSchema = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  track: z.enum(["Python", "R", "literacy"]),
  programmingLanguage: z.enum(["Python", "R", ""]),
  tags: z.array(z.string()),
  version: z.number().int().nonnegative().optional(),
  sourceMarkdown: z.string().optional(),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        blocks: z.array(BlockSchema),
      }),
    )
    .min(1),
});
export type LessonDraft = z.infer<typeof LessonSchema>;
const uid = () => crypto.randomUUID();
export const defaults: { [K in BlockType]: () => Extract<Block, { type: K }> } =
  {
    text: () => ({
      id: uid(),
      type: "text",
      visible: true,
      markdown: "Write learner-facing content.",
    }),
    task: () => ({
      id: uid(),
      type: "task",
      visible: true,
      statement: "Complete this task.",
      context: "",
      functions: [],
    }),
    "quick-reference": () => ({
      id: uid(),
      type: "quick-reference",
      visible: true,
      title: "Quick reference",
      markdown: "Useful syntax.",
    }),
    "worked-example": () => ({
      id: uid(),
      type: "worked-example",
      visible: true,
      title: "",
      language: "python",
      code: "print('Hello')",
      explanation: "",
      runnable: true,
    }),
    figure: () => ({
      id: uid(),
      type: "figure",
      visible: true,
      imageUrl: "https://placehold.co/800x450",
      alt: "Describe this figure",
      caption: "",
      markdown: "",
    }),
    mcq: () => ({
      id: uid(),
      type: "mcq",
      visible: true,
      question: "Choose an answer.",
      multiple: false,
      choices: [
        { id: uid(), text: "Option one", correct: true },
        { id: uid(), text: "Option two", correct: false },
      ],
      explanation: "Explain why.",
    }),
    "code-exercise": () => ({
      id: uid(),
      type: "code-exercise",
      visible: true,
      language: "python",
      starterCode: "# Write your code here",
      execution: "browser",
      instructions: "Write a program.",
      additionalPenalties: "",
      ignoredIssues: "",
    }),
    reflection: () => ({
      id: uid(),
      type: "reflection",
      visible: true,
      prompt: "What did you learn?",
      rubric: { keyIdeas: "", misconceptions: "", variants: "" },
    }),
    "data-asset": () => ({
      id: uid(),
      type: "data-asset",
      visible: true,
      url: "https://example.edu/data.csv",
      filename: "data.csv",
      description: "",
    }),
  };
export function validateDraft(v: unknown) {
  const p = LessonSchema.safeParse(v);
  const errors = p.success
    ? []
    : p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`);
  if (p.success) {
    const ids = p.data.steps.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      errors.push("steps: Step IDs must be unique");
    const blockIds = p.data.steps.flatMap((s) => s.blocks.map((b) => b.id));
    if (new Set(blockIds).size !== blockIds.length)
      errors.push("steps: Card IDs must be unique");
  }
  if (p.success)
    p.data.steps.forEach((s, i) =>
      s.blocks.forEach((b, j) => {
        if (
          b.type === "mcq" &&
          new Set(b.choices.map((c) => c.id)).size !== b.choices.length
        )
          errors.push(
            `steps.${i}.blocks.${j}.choices: Option IDs must be unique`,
          );
        if (b.type === "mcq" && !b.choices.some((c) => c.correct))
          errors.push(
            `steps.${i}.blocks.${j}.choices: MCQ needs a correct choice`,
          );
        if (
          b.type === "mcq" &&
          !b.multiple &&
          b.choices.filter((c) => c.correct).length !== 1
        )
          errors.push(
            `steps.${i}.blocks.${j}.choices: Single-answer MCQ needs exactly one correct choice`,
          );
        if (
          b.type === "figure" &&
          (!b.alt.trim() || !z.string().url().safeParse(b.imageUrl).success)
        )
          errors.push(
            `steps.${i}.blocks.${j}.imageUrl: Figure needs a valid URL and alt text`,
          );
      }),
    );
  return errors;
}
