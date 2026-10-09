import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/BlockRenderer";
import { markdownLinkHref } from "../lib/link-href";

function html(text: string) {
  return renderToStaticMarkup(createElement(Markdown, null, text));
}

describe("Markdown links", () => {
  it("keeps other schemes and schemeless hrefs as typed", () => {
    expect(html("[site](example.com)")).toContain('href="example.com"');
    expect(html("[mail](mailto:teacher@school.edu)")).toContain(
      'href="mailto:teacher@school.edu"',
    );
    expect(html("[rel](/lessons/intro)")).toContain('href="/lessons/intro"');
    expect(html("[files](ftp://files.example.com/a)")).toContain(
      'href="ftp://files.example.com/a"',
    );
    expect(html("[port](example.com:8080/path)")).toContain(
      'href="example.com:8080/path"',
    );
    expect(html("[ok](https://example.com/a)")).toContain(
      'href="https://example.com/a"',
    );
  });

  it("refuses javascript and data urls", () => {
    for (const sample of [
      "[x](javascript:alert(1))",
      "[x](JAVASCRIPT:alert(1))",
      "[x](data:text/html,hi)",
      "[x](DATA:text/html,hi)",
    ]) {
      const markup = html(sample);
      expect(markup).not.toContain("javascript:");
      expect(markup).not.toContain("data:");
      expect(markup).toContain('href=""');
    }
    expect(markdownLinkHref("\u0000javascript:alert(1)")).toBe("");
    expect(markdownLinkHref("\tdata:text/html,hi")).toBe("");
    expect(markdownLinkHref("example.com")).toBe("example.com");
  });
});
