import { readFileSync } from "node:fs";
import { parseLessonMarkdown } from "../lib/markdown";
import type { LessonDraft } from "../lib/content";
export function sampleBlocks() {
  const parsed = parseLessonMarkdown(
    readFileSync("content/component-reference.md", "utf8"),
    {} as LessonDraft,
  );
  if (!parsed.draft) throw new Error(JSON.stringify(parsed.errors));
  return parsed.draft.steps.flatMap((s) => s.blocks);
}
