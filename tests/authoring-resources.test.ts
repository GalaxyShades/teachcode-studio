import { expect, it } from "vitest";
import { authoringResources } from "../lib/authoring-resources";
import { parseLessonMarkdown, serializeLessonMarkdown } from "../lib/markdown";
import { validateDraft, blockTypes, type LessonDraft } from "../lib/content";

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
