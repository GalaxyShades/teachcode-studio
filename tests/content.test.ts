import { describe, it, expect } from "vitest";
import { defaults, validateDraft } from "../lib/content";
describe("content validation", () =>
  it("requires a correct MCQ option", () => {
    const m = defaults.mcq();
    m.choices.forEach((x) => (x.correct = false));
    expect(
      validateDraft({
        title: "T",
        slug: "t",
        description: "",
        track: "Python",
        level: "year 1",
        mode: "lesson",
        programmingLanguage: "Python",
        tags: [],
        presentation: "guided",
        runtimeScope: "per-step",
        steps: [{ id: "s", title: "S", blocks: [m] }],
      }),
    ).not.toEqual([]);
  }));
