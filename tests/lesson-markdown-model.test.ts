import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyDraft } from "../lib/cms";
import { parseLessonMarkdown } from "../lib/markdown";
import { lessonMarkdownFromModel } from "../lib/openrouter";

const missingStepClosers = `:::lesson{title="Variables in Python" slug="variables-in-python" description="Names that refer to values." track="Python" programmingLanguage="Python" tags="[\\"variables\\"]" schemaVersion=1}
:::

:::step{id="what-are-variables" title="What are variables?"}
:::text{id="variables-explanation" visible=true}
:::markdown
A variable is a name that refers to a value.

\`\`\`python
name = "Ada"
\`\`\`
:::
:::

:::step{id="check" title="Check"}
:::mcq{id="names" visible=true multiple=false}
:::question
Which name is valid?
:::
:::choices
:::choice{id="ok" correct=true}
user_name
:::
:::choice{id="no" correct=false}
1st_name
:::
:::
:::explanation
A name cannot start with a digit.
:::
:::
`;

describe("lessonMarkdownFromModel", () => {
  it("closes a step the model left open before the next step", () => {
    const markdown = lessonMarkdownFromModel(missingStepClosers);
    const parsed = parseLessonMarkdown(markdown, emptyDraft());
    expect(parsed.errors).toEqual([]);
    expect(parsed.draft?.steps.map((step) => step.id)).toEqual([
      "what-are-variables",
      "check",
    ]);
  });

  it("closes an mcq before the next card in the same step", () => {
    const markdown =
      lessonMarkdownFromModel(`:::lesson{title="Variables" slug="variables" description="Names." track="Python" programmingLanguage="Python" tags="[\\"variables\\"]" schemaVersion=1}
:::
:::step{id="check" title="Check"}
:::mcq{id="one" visible=true multiple=false}
:::question
Which name is valid?
:::
:::choices
:::choice{id="ok" correct=true}
user_name
:::
:::choice{id="no" correct=false}
1st_name
:::
:::
:::explanation
A name cannot start with a digit.
:::
:::mcq{id="two" visible=true multiple=false}
:::question
Which name is different?
:::
:::choices
:::choice{id="same" correct=false}
name
:::
:::choice{id="other" correct=true}
Name
:::
:::
:::explanation
Letter case matters.
:::
:::`);
    const parsed = parseLessonMarkdown(markdown, emptyDraft());
    expect(parsed.errors).toEqual([]);
    expect(parsed.draft?.steps[0].blocks.map((block) => block.id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("leaves a closed reference lesson unchanged", () => {
    const source = readFileSync(
      "content/component-reference.md",
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(lessonMarkdownFromModel(source).trim()).toBe(source.trim());
  });
});
