import { describe, expect, it } from "vitest";
import {
  activeFormats,
  linkAt,
  toggleBullets,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleNumbered,
  toggleParagraph,
  toggleQuote,
  toggleRule,
  toggleWrap,
  wrapMarkers,
} from "../lib/field-markup";

describe("field markup toggles", () => {
  it("wraps plain text and unwraps when the cursor is already inside", () => {
    const wrapped = toggleWrap("See this", 4, 8, wrapMarkers.bold);
    expect(wrapped.text).toBe("**this**");
    const source = "See **this**";
    expect(activeFormats(source, 6, 6).bold).toBe(true);
    expect(toggleWrap(source, 6, 10, wrapMarkers.bold)).toEqual({
      from: 4,
      to: 12,
      text: "this",
    });
    expect(toggleWrap(source, 4, 12, wrapMarkers.bold).text).toBe("this");
  });

  it("wraps a selection that is only partly inside bold", () => {
    expect(toggleWrap("**ab** cd", 2, 8, wrapMarkers.bold).text).toBe(
      "**ab** c**",
    );
  });

  it("toggles strikethrough and underline independently", () => {
    const source = "~~gone~~ ++under++";
    expect(activeFormats(source, 3, 3)).toMatchObject({
      strike: true,
      underline: false,
    });
    expect(activeFormats(source, 12, 12).underline).toBe(true);
    expect(toggleWrap(source, 12, 12, wrapMarkers.underline).text).toBe(
      "under",
    );
  });

  it("toggles bullet lines without doubling the marker", () => {
    expect(toggleBullets("First\nSecond", 0, 5)).toEqual({
      from: 0,
      to: 5,
      text: "- First",
    });
    const listed = "- First\n- Second";
    expect(activeFormats(listed, 3, 3).bullet).toBe(true);
    expect(toggleBullets(listed, 0, listed.length).text).toBe("First\nSecond");
    expect(toggleBullets("- First\nSecond", 0, 14).text).toBe(
      "- First\n- Second",
    );
  });

  it("toggles numbered lines and switches them with bullets", () => {
    expect(toggleNumbered("First\nSecond", 0, 12)).toEqual({
      from: 0,
      to: 12,
      text: "1. First\n2. Second",
    });
    const listed = "1. First\n2. Second";
    expect(activeFormats(listed, 3, 3).numbered).toBe(true);
    expect(toggleNumbered(listed, 0, listed.length).text).toBe("First\nSecond");
    expect(toggleNumbered("- First\n- Second", 0, 17).text).toBe(
      "1. First\n2. Second",
    );
    expect(toggleBullets("1. First\n2. Second", 0, 17).text).toBe(
      "- First\n- Second",
    );
  });

  it("toggles italic and inline code without treating bold as italic", () => {
    expect(toggleItalic("word", 0, 4).text).toBe("*word*");
    const italic = "See *word*";
    expect(activeFormats(italic, 6, 6).italic).toBe(true);
    expect(toggleItalic(italic, 6, 6).text).toBe("word");
    expect(activeFormats("**bold**", 3, 3)).toMatchObject({
      bold: true,
      italic: false,
    });
    expect(toggleCode("print", 0, 5).text).toBe("`print`");
    expect(activeFormats("use `print` here", 6, 6).code).toBe(true);
    expect(toggleCode("use `print` here", 5, 10).text).toBe("print");
  });

  it("toggles heading, quote, paragraph, rule, and code blocks", () => {
    expect(toggleHeading("Title", 0, 5).text).toBe("## Title");
    expect(activeFormats("## Title", 4, 4).heading).toBe(true);
    expect(toggleHeading("## Title", 3, 3).text).toBe("Title");
    expect(toggleQuote("Said", 0, 4).text).toBe("> Said");
    expect(activeFormats("> Said", 3, 3).quote).toBe(true);
    expect(toggleQuote("> Said", 0, 6).text).toBe("Said");
    expect(toggleParagraph("## Title", 0, 8).text).toBe("Title");
    expect(activeFormats("Plain line", 1, 1).paragraph).toBe(true);
    expect(toggleRule("stay", 4, 4).text).toBe("\n---\n");
    expect(activeFormats("---", 1, 1).rule).toBe(true);
    expect(toggleRule("---", 1, 1).text).toBe("");
    const fenced = toggleCodeBlock("print(1)", 0, 8);
    expect(fenced.text).toBe("```python\nprint(1)\n```");
    const source = fenced.text;
    expect(activeFormats(source, 12, 12).codeBlock).toBe(true);
    expect(toggleCodeBlock(source, 12, 12).text).toBe("print(1)");
    const host = "See print(1) now";
    const mid = toggleCodeBlock(host, 4, 12);
    expect(mid.text).toBe("\n```python\nprint(1)\n```\n");
    const joined = host.slice(0, 4) + mid.text + host.slice(12);
    const inner = 4 + "\n```python\n".length + 2;
    expect(activeFormats(joined, inner, inner).codeBlock).toBe(true);
  });

  it("finds a markdown link under the cursor", () => {
    const source = "Read [the docs](example.com) now";
    expect(linkAt(source, 8, 8)).toEqual({
      from: 5,
      to: 28,
      title: "the docs",
      url: "example.com",
    });
    expect(linkAt(source, 0, 4)).toBeNull();
    expect(linkAt("![pic](example.com)", 2, 2)).toBeNull();
  });
});
