"use client";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
hljs.registerLanguage("python", python);
hljs.registerLanguage("r", r);
export function highlightCode(code: string, language: string) {
  if (!hljs.getLanguage(language))
    return code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}
export function CodeDisplay({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <pre className="overflow-auto rounded bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-100">
      <code
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </pre>
  );
}
