import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Read the same canonical files used by parser tests and the local seed. */
export function authoringResources() {
  const template = readFileSync(
    join(process.cwd(), "content/component-reference.md"),
    "utf8",
  );
  return {
    template,
    prompt: [
      readFileSync(
        join(process.cwd(), "content/ai-authoring-prompt.md"),
        "utf8",
      ),
      "## TeachCode dialect\n\n" +
        readFileSync(join(process.cwd(), "docs/markdown.md"), "utf8"),
      "## Complete syntax example\n\n" + template,
      "END OF AUTHORING GUIDE\n\nSOURCE DOCUMENT / SLIDE CONTENT:\n[Paste your source here, or attach it with this prompt.]",
    ].join("\n\n"),
  };
}
