import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/BlockRenderer";
import { prepareLearnerMarkdown } from "../lib/learner-math";

function html(text: string) {
  return renderToStaticMarkup(createElement(Markdown, null, text));
}

function visible(markup: string) {
  return markup
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, "");
}

const beta = String.raw`y_i = \beta_0 + \beta_1 x_i + \epsilon_i`;

describe("learner math", () => {
  it("typesets delimited formulas and leaves code and HTML literal", () => {
    const inline = html(`See $${beta}$.`);
    const display = html(`$$${beta}$$`);
    const paren = html(String.raw`\(` + beta + String.raw`\)`);
    const bracket = html(String.raw`\[` + beta + String.raw`\]`);
    for (const markup of [inline, display, paren, bracket]) {
      expect(markup).toContain("katex");
      expect(visible(markup)).not.toContain("\\beta");
      expect(visible(markup)).not.toContain("\\epsilon");
    }
    expect(inline).not.toContain("katex-display");
    expect(display).toContain("katex-display");
    expect(bracket).toContain("katex-display");
    expect(paren).not.toContain("katex-display");
    const fenced = html("```\n$" + beta + "$\n```");
    expect(fenced).not.toContain("katex");
    expect(fenced).toContain("\\beta_0");
    const raw = html(
      'Before <script>alert(1)</script> <img src=x onerror="alert(1)"> after',
    );
    expect(raw).toContain("Before");
    expect(raw).toContain("after");
    expect(raw).not.toContain("<script>");
    expect(raw).not.toContain("<img");
    expect(html(String.raw`$\href{javascript:alert(1)}{x}$`)).not.toContain(
      'href="javascript:',
    );
  });

  it("keeps fenced and inline code unchanged", () => {
    const source = "Use `$y$` and\n\n```\n\\[y\\]\n$$\n```\n\nthen \\(a\\).";
    const prepared = prepareLearnerMarkdown(source);
    expect(prepared).toContain("`$y$`");
    expect(prepared).toContain("```\n\\[y\\]\n$$\n```");
    expect(prepared).toContain("$$");
    expect(prepared).toContain("a");
  });
});
