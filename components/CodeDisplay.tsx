"use client";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
hljs.registerLanguage("python", python);
hljs.registerLanguage("r", r);
export function CodeDisplay({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const html = hljs.getLanguage(language)
    ? hljs.highlight(code, { language, ignoreIllegals: true }).value
    : code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    <pre className="overflow-auto rounded bg-zinc-950 p-4 text-zinc-100">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
