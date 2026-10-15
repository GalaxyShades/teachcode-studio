import {
  emptyAssistant,
  validateDraft,
  type AssistantSettings,
  type Block,
  type LessonDraft,
} from "./content";

export type ImportCourse = {
  module: string;
  slug: string;
  title: string;
  description: string;
  chapters: { topic: string; title: string }[];
};

/** The two YAML catalog courses, written as Studio slugs. */
export const IMPORT_COURSES: ImportCourse[] = [
  {
    module: "COMP1117",
    slug: "comp1117",
    title: "COMP1117 · Python",
    description:
      "Start with Café Code Sprint, then Decision Dash. Run code in the browser. Ask the tutor when you get stuck.",
    chapters: [
      { topic: "python-foundations", title: "Chapter 1 · Python Foundations" },
      { topic: "python-core-skills", title: "Chapter 2 · Core Python Skills" },
      {
        topic: "python-data-libraries",
        title: "Chapter 3 · Python Data Libraries",
      },
    ],
  },
  {
    module: "BBMS1021",
    slug: "bbms1021",
    title: "BBMS1021 · R (BIOF1001)",
    description:
      "Introductory biostatistics in the browser: Introduction to R, ggplot2, and dplyr.",
    chapters: [
      { topic: "introduction-to-r", title: "Introduction to R Language" },
      { topic: "ggplot2", title: "ggplot2" },
      { topic: "dplyr", title: "dplyr: data manipulation" },
    ],
  },
];

export const UNASSIGNED_CHAPTER = "Lessons";

type Asset = { url?: string; vfsPath?: string };
type Worked = { code?: string; note?: string; runnable?: boolean };
type QuizQuestion = {
  question?: string;
  explanation?: string;
  allowMultiple?: boolean;
  options?: { text?: string; correct?: boolean }[];
};

export type YamlStep = {
  id?: string;
  title?: string;
  markdown?: string;
  execution?: string;
  reflectionPrompt?: string;
  reflectionRubric?: {
    keyIdeas?: string[];
    commonMisconceptions?: string[];
    acceptableVariants?: string[];
  };
  reviewPrinciples?: string[];
  dataAssets?: Asset[];
  check?: { code?: string };
  randomization?: { values?: { token?: string; min?: number; max?: number }[] };
  assistant?: { chips?: string[]; systemPrompt?: string };
  instruction?: {
    description?: string;
    descriptionAfter?: string;
    task?: string;
    functions?: { name?: string; summary?: string }[];
    quickReference?: string;
    workedExamples?: Worked[];
    asideFigure?: { src?: string; alt?: string; caption?: string; body?: string };
  };
  code?: { language?: string; starter?: string; solution?: string };
  quiz?: { questions?: QuizQuestion[] };
};

export type YamlPack = {
  id?: string;
  title?: string;
  description?: string;
  track?: string;
  language?: string;
  tags?: string[];
  packages?: string[];
  dataAssets?: Asset[];
  codeReview?: {
    weakExample?: string;
    strongExample?: string;
    blocks?: { title?: string; purpose?: string; mechanism?: string; output?: string }[];
  };
  steps?: YamlStep[];
};

export type ConvertedLesson = {
  draft: LessonDraft;
  assistant: AssistantSettings;
  errors: string[];
};

function trackOf(track: string | undefined): LessonDraft["track"] {
  if (track === "r") return "R";
  if (track === "literacy") return "literacy";
  return "Python";
}

function languageOf(language: string | undefined): "python" | "r" {
  return language === "r" ? "r" : "python";
}

function programmingLanguage(
  language: string | undefined,
): LessonDraft["programmingLanguage"] {
  return language === "r" ? "R" : "Python";
}

export function absoluteAssetUrl(raw: string, origin: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = origin.replace(/\/$/, "");
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function filenameOf(asset: Asset): string {
  const named = asset.vfsPath?.trim();
  if (named) return named.split("/").pop() || named;
  try {
    const path = new URL(asset.url || "https://example.edu/data.bin").pathname;
    return path.split("/").pop() || "data.bin";
  } catch {
    return "data.bin";
  }
}

function text(id: string, markdown: string): Block {
  return { id, type: "text", visible: true, markdown };
}

function blocksForStep(
  step: YamlStep,
  index: number,
  language: "python" | "r",
  origin: string,
  packAssets: Asset[],
): Block[] {
  const stepId = step.id || `step-${index + 1}`;
  const blocks: Block[] = [];
  const instruction = step.instruction;
  if (step.markdown?.trim()) blocks.push(text(`${stepId}-markdown`, step.markdown));
  if (instruction?.description?.trim())
    blocks.push(text(`${stepId}-description`, instruction.description));
  if (instruction?.asideFigure?.src && instruction.asideFigure.alt) {
    blocks.push({
      id: `${stepId}-figure`,
      type: "figure",
      visible: true,
      imageUrl: absoluteAssetUrl(instruction.asideFigure.src, origin),
      alt: instruction.asideFigure.alt,
      caption: instruction.asideFigure.caption,
      markdown: instruction.asideFigure.body || "",
    });
  }
  if (instruction?.descriptionAfter?.trim())
    blocks.push(text(`${stepId}-after`, instruction.descriptionAfter));
  if (instruction?.quickReference?.trim())
    blocks.push({
      id: `${stepId}-reference`,
      type: "quick-reference",
      visible: true,
      title: "Quick reference",
      markdown: instruction.quickReference,
    });
  for (const [i, example] of (instruction?.workedExamples ?? []).entries()) {
    if (!example.code?.trim()) continue;
    blocks.push({
      id: `${stepId}-example-${i + 1}`,
      type: "worked-example",
      visible: true,
      title: "",
      language,
      code: example.code,
      explanation: example.note || "",
      runnable: Boolean(example.runnable),
    });
  }
  if (instruction?.task?.trim()) {
    blocks.push({
      id: `${stepId}-task`,
      type: "task",
      visible: true,
      statement: instruction.task,
      context: "",
      functions: (instruction.functions ?? [])
        .filter((fn) => fn.name && fn.summary)
        .map((fn) => ({ name: fn.name as string, summary: fn.summary as string })),
    });
  }
  for (const [qi, question] of (step.quiz?.questions ?? []).entries()) {
    const choices = (question.options ?? []).filter((option) => option.text?.trim());
    if (!question.question?.trim() || choices.length < 2) continue;
    const correctCount = choices.filter((option) => option.correct).length;
    blocks.push({
      id: `${stepId}-mcq-${qi + 1}`,
      type: "mcq",
      visible: true,
      question: question.question,
      multiple: Boolean(question.allowMultiple) || correctCount > 1,
      choices: choices.map((option, oi) => ({
        id: `${stepId}-q${qi + 1}-o${oi + 1}`,
        text: option.text as string,
        correct: Boolean(option.correct),
      })),
      explanation: question.explanation || "",
    });
  }
  const assets = [
    ...(index === 0 ? packAssets : []),
    ...(step.dataAssets ?? []),
  ].filter((asset) => asset.url?.trim());
  for (const [i, asset] of assets.entries()) {
    blocks.push({
      id: `${stepId}-data-${i + 1}`,
      type: "data-asset",
      visible: true,
      url: absoluteAssetUrl(asset.url as string, origin),
      filename: filenameOf(asset),
      runtimePath: asset.vfsPath,
      description: "",
    });
  }
  if (step.code) {
    const personal = (step.randomization?.values ?? [])
      .filter((value) => value.token)
      .map((value) => `${value.token} (${value.min}–${value.max})`)
      .join(", ");
    blocks.push({
      id: `${stepId}-code`,
      type: "code-exercise",
      visible: true,
      language: step.code.language === "r" ? "r" : language,
      starterCode: step.code.starter || "",
      solution: step.code.solution,
      execution: step.execution === "server" ? "server" : "browser",
      instructions: [
        instruction?.task?.trim() || "Write and run the code for this step.",
        personal ? `This step personalizes: ${personal}.` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      checkScript: step.check?.code,
      additionalPenalties: (step.reviewPrinciples ?? []).join("\n"),
      ignoredIssues: "",
    });
  }
  if (step.reflectionPrompt?.trim()) {
    const rubric = step.reflectionRubric;
    blocks.push({
      id: `${stepId}-reflection`,
      type: "reflection",
      visible: true,
      prompt: step.reflectionPrompt,
      rubric: {
        keyIdeas: (rubric?.keyIdeas ?? []).join("\n"),
        misconceptions: (rubric?.commonMisconceptions ?? []).join("\n"),
        variants: (rubric?.acceptableVariants ?? []).join("\n"),
      },
    });
  }
  if (blocks.length === 0) blocks.push(text(`${stepId}-empty`, "Continue when you are ready."));
  return blocks;
}

export function lessonFromPack(
  pack: YamlPack,
  origin: string,
  version = 0,
): ConvertedLesson {
  const language = languageOf(pack.language);
  const steps = pack.steps ?? [];
  const draft: LessonDraft = {
    title: pack.title?.trim() || "Untitled lesson",
    slug: pack.id || "untitled",
    description: pack.description || "",
    track: trackOf(pack.track),
    programmingLanguage: programmingLanguage(pack.language),
    tags: pack.tags ?? [],
    version,
    steps: steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      title: step.title?.trim() || `Step ${index + 1}`,
      blocks: blocksForStep(step, index, language, origin, pack.dataAssets ?? []),
    })),
  };
  if (pack.packages?.length) {
    draft.tags = [...draft.tags, ...pack.packages.map((name) => `package:${name}`)];
  }
  const review = pack.codeReview?.blocks ?? [];
  if (review.length && draft.steps[0]) {
    const lines = review.map((block) =>
      [`### ${block.title || "Block"}`, block.purpose, block.mechanism, block.output]
        .filter(Boolean)
        .join("\n\n"),
    );
    if (pack.codeReview?.weakExample) lines.push(`Weak example:\n\n${pack.codeReview.weakExample}`);
    if (pack.codeReview?.strongExample)
      lines.push(`Strong example:\n\n${pack.codeReview.strongExample}`);
    draft.steps[0].blocks.push(text(`${draft.steps[0].id}-review`, lines.join("\n\n")));
  }
  if (draft.steps.length === 0) {
    draft.steps = [
      {
        id: "step-1",
        title: "Step 1",
        blocks: [text("step-1-empty", pack.description || "Continue when you are ready.")],
      },
    ];
  }
  const chips = steps.flatMap((step) => step.assistant?.chips ?? []);
  const constraints = steps
    .map((step) => step.assistant?.systemPrompt?.trim())
    .filter(Boolean)
    .join("\n\n");
  const assistant: AssistantSettings = chips.length || constraints
    ? { suggestedQuestions: chips.join("\n"), constraints }
    : emptyAssistant();
  return { draft, assistant, errors: validateDraft(draft) };
}
