import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { authoringResources } from "../lib/authoring-resources";
import { parseLessonMarkdown, serializeLessonMarkdown } from "../lib/markdown";
import { validateDraft, blockTypes, type LessonDraft } from "../lib/content";
import {
  markdownFieldPrompt,
  plannerSystemPrompt,
} from "../lib/planner/prompt";

it("ships a publishable full template and a self-contained AI prompt", () => {
  const { template, prompt } = authoringResources();
  const parsed = parseLessonMarkdown(template, {} as LessonDraft);
  expect(parsed.errors).toEqual([]);
  expect(validateDraft(parsed.draft)).toEqual([]);
  expect(
    parsed.draft!.steps.flatMap((step) => step.blocks.map((b) => b.type)),
  ).toEqual(blockTypes);
  const exported = serializeLessonMarkdown(parsed.draft!);
  expect(
    serializeLessonMarkdown(
      parseLessonMarkdown(exported, parsed.draft!).draft!,
    ),
  ).toBe(exported);
  expect(prompt).toContain(template);
  expect(prompt).toContain("## Nested directives");
  expect(prompt).toContain("SOURCE DOCUMENT / SLIDE CONTENT:");
});

it("keeps the Markdown field instruction identical in both authoring prompts", () => {
  const authoring = readFileSync("content/ai-authoring-prompt.md", "utf8");
  expect(authoring).toContain(markdownFieldPrompt);
  expect(authoringResources().prompt).toContain(markdownFieldPrompt);
  expect(plannerSystemPrompt()).toContain(markdownFieldPrompt);
  expect(authoring).toContain(
    "Code runs in the browser. pandas and urllib can read http and https URLs. Do not install packages or open local files. Server execution is not available.",
  );
});
