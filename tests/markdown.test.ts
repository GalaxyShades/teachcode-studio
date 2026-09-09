import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  blockTypes,
  defaults,
  LessonSchema,
  type LessonDraft,
} from "../lib/content";
import { parseLessonMarkdown, serializeLessonMarkdown } from "../lib/markdown";
const base: LessonDraft = {
  title: 'A "quoted" title',
  slug: "sample",
  description: "Line 1\nLine 2",
  track: "Python",
  level: "year 1",
  mode: "lesson",
  programmingLanguage: "Python",
  tags: ["one", "two"],
  presentation: "guided",
  runtimeScope: "per-step",
  steps: [{ id: "step", title: 'Step \\ "one"', blocks: [] }],
};
function normalize(d: LessonDraft) {
  return {
    ...d,
    sourceMarkdown: undefined,
    steps: d.steps.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => ({ ...b, advanced: b.advanced ?? false })),
    })),
  };
}
describe("strict Markdown", () => {
  for (const type of blockTypes)
    it(`round trips ${type}`, () => {
      const draft = {
        ...base,
        steps: [{ ...base.steps[0], blocks: [defaults[type]()] }],
      };
      const source = serializeLessonMarkdown(draft),
        parsed = parseLessonMarkdown(source, base);
      expect(parsed.errors).toEqual([]);
      expect(normalize(parsed.draft!)).toEqual(normalize(draft));
      expect(serializeLessonMarkdown(parsed.draft!)).toBe(source);
    });
  it("preserves literal directives, whitespace and code fences", () => {
    const b = defaults.text();
    b.markdown = '\n:::unknown\n```python\nprint("x")\n```\n  ';
    const d = { ...base, steps: [{ ...base.steps[0], blocks: [b] }] };
    expect(
      parseLessonMarkdown(serializeLessonMarkdown(d), base).draft?.steps[0]
        .blocks[0],
    ).toMatchObject(b);
  });
  it("rejects unknown components", () =>
    expect(
      parseLessonMarkdown(
        ':::step{id="s" title="S"}\n:::nonsense\n:::\n:::',
        base,
      ).errors[0],
    ).toMatchObject({ line: 2 }));
  it("rejects unclosed directives", () =>
    expect(
      parseLessonMarkdown(':::step{id="s" title="S"}', base).errors.some((e) =>
        e.message.includes("Unclosed"),
      ),
    ).toBe(true));
  it("rejects future versions without silently converting", () =>
    expect(
      parseLessonMarkdown(
        ':::lesson{schemaVersion=2}\n:::\n:::step{id="s" title="S"}\n:::',
        base,
      ).errors.some((e) => e.message.includes("Unsupported")),
    ).toBe(true));
  it("loads the reference source", () => {
    const parsed = parseLessonMarkdown(
      readFileSync("content/component-reference.md", "utf8"),
      base,
    );
    expect(parsed.errors).toEqual([]);
    expect(
      parsed.draft?.steps.flatMap((s) => s.blocks).map((b) => b.type),
    ).toEqual(blockTypes);
    expect(LessonSchema.safeParse(parsed.draft).success).toBe(true);
  });
});
it("preserves fenced Markdown and directives in every nested text field", () => {
  const t = defaults.task();
  t.functions = [{ name: 'say("hello")', summary: ":::literal\n```code\n```" }];
  const m = defaults.mcq();
  m.choices[0].text = ":::literal";
  const q = defaults["quick-reference"]();
  q.markdown = "```python\nprint(1)\n```";
  const w = defaults["worked-example"]();
  w.code = "```not a code fence to strip```";
  const d = { ...base, steps: [{ ...base.steps[0], blocks: [t, m, q, w] }] };
  const p = parseLessonMarkdown(serializeLessonMarkdown(d), base);
  expect(p.errors).toEqual([]);
  expect(normalize(p.draft!)).toEqual(normalize(d));
});

it("preserves code fences in direct text component bodies", () => {
 const markdown = "```python\nprint(1)\n```";
 const parsed = parseLessonMarkdown(':::step{id="s" title="S"}\n:::text\n'+markdown+'\n:::\n:::', base);
 expect(parsed.errors).toEqual([]);
 expect(parsed.draft?.steps[0].blocks[0]).toMatchObject({type:"text",markdown});
});
