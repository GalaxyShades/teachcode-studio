import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineText } from "../components/InlineText";
import { parseInline } from "../lib/inline-text";

function html(text: string) {
  return renderToStaticMarkup(createElement(InlineText, { text }));
}

describe("parseInline", () => {
  it("renders inline code without keeping the backticks", () => {
    expect(parseInline('See `2 * "ab" + "c"` next')).toEqual([
      { type: "text", text: "See " },
      { type: "code", text: '2 * "ab" + "c"' },
      { type: "text", text: " next" },
    ]);
  });

  it("supports bold, strikethrough, underline, and http(s) links", () => {
    expect(parseInline("**bold** ~~gone~~ ++under++")).toEqual([
      { type: "bold", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " " },
      { type: "strike", children: [{ type: "text", text: "gone" }] },
      { type: "text", text: " " },
      { type: "underline", children: [{ type: "text", text: "under" }] },
    ]);
    expect(parseInline("[docs](https://example.com/a)")).toEqual([
      {
        type: "link",
        href: "https://example.com/a",
        children: [{ type: "text", text: "docs" }],
      },
    ]);
    expect(parseInline("[docs](http://example.com)")[0]).toMatchObject({
      type: "link",
      href: "http://example.com/",
    });
  });

  it("nests code inside bold and leaves code contents literal", () => {
    expect(parseInline("**use `print`**")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "use " },
          { type: "code", text: "print" },
        ],
      },
    ]);
  });

  it("does not enable headings, lists, images, fences, or raw html", () => {
    expect(parseInline("# Title")).toEqual([{ type: "text", text: "# Title" }]);
    expect(parseInline("- item")).toEqual([{ type: "text", text: "- item" }]);
    expect(parseInline("![alt](https://example.com/a.png)")).toEqual([
      { type: "text", text: "![alt](https://example.com/a.png)" },
    ]);
    expect(parseInline("```\ncode\n```")).toEqual([
      { type: "text", text: "```\ncode\n```" },
    ]);
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("leaves unsafe and non-http links as text", () => {
    for (const sample of [
      "[x](javascript:alert(1))",
      "[x](data:text/html,hi)",
      "[x](/relative)",
      '[x](https://example.com" onclick=alert(1))',
    ]) {
      expect(parseInline(sample)).toEqual([{ type: "text", text: sample }]);
    }
  });

  it("does not treat python operators as markup", () => {
    expect(parseInline("2 ** 3 and i++ + j++ and __name__")).toEqual([
      { type: "text", text: "2 ** 3 and i++ + j++ and __name__" },
    ]);
  });
});

describe("InlineText", () => {
  it("emits only the allowed tags and escapes text", () => {
    const markup = html(
      "**<b>nope</b>** `a<b>` [ok](https://example.com) ++u++ ~~s~~ <img src=x onerror=alert(1)>",
    );
    expect(markup).toContain("<strong>");
    expect(markup).toContain("<code");
    expect(markup).toContain("<del>");
    expect(markup).toContain("<u>");
    expect(markup).toContain('href="https://example.com/"');
    expect(markup).not.toContain("<b>");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script");
    expect(markup).toContain("&lt;b&gt;nope&lt;/b&gt;");
    expect(markup).toContain("a&lt;b&gt;");
    expect(markup).not.toContain("`a");
  });
});
