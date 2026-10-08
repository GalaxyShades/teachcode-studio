"use client";

import { useRef, useState } from "react";

export function AuthoringGuide({
  template,
  prompt,
}: {
  template: string;
  prompt: string;
}) {
  const [resource, setResource] = useState<"prompt" | "template">("prompt");
  const [status, setStatus] = useState("");
  const source = useRef<HTMLTextAreaElement>(null);
  const value = resource === "prompt" ? prompt : template;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-teal-800">
        Authoring toolkit
      </p>
      <h2 className="text-2xl font-bold">From source to lesson</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Turn your slides or document into an editable lesson using your
        preferred AI app.
      </p>
      <ol className="my-5 grid gap-3 text-sm sm:grid-cols-3">
        {[
          [
            "1. Copy the prompt",
            "It includes the full format guide and every card type.",
          ],
          [
            "2. Add your source",
            "Paste the prompt with your document or slides into your AI app.",
          ],
          [
            "3. Review in Studio",
            "Paste the result in Markdown, fix any issues, then preview and publish.",
          ],
        ].map(([title, description]) => (
          <li key={title} className="rounded-xl bg-teal-50 p-4">
            <b className="text-teal-900">{title}</b>
            <p className="mt-2 text-zinc-700">{description}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2" aria-label="Authoring resources">
        {(["prompt", "template"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={resource === key}
            className={resource === key ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setResource(key);
              setStatus("");
            }}
          >
            {key === "prompt" ? "AI prompt" : "Complete Markdown template"}
          </button>
        ))}
      </div>
      <p className="my-3 text-sm text-zinc-600">
        {resource === "prompt"
          ? "Copy everything below. Add your source at the end, or attach it in your AI app. Review generated facts and answers before publishing."
          : "A valid, importable example of every card and supported Markdown formatting. Download it, adapt it, then use Import Markdown. Import replaces the current lesson content; start with a new lesson to keep an existing draft."}
      </p>
      <textarea
        ref={source}
        aria-label={
          resource === "prompt"
            ? "Copyable AI prompt"
            : "Copyable Markdown template"
        }
        readOnly
        value={value}
        className="field h-56 resize-y bg-zinc-50 font-mono text-xs leading-relaxed"
        spellCheck={false}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setStatus("Copied to clipboard.");
            } catch {
              source.current?.focus();
              source.current?.select();
              setStatus(
                "Clipboard unavailable. Text selected: press Ctrl+C or ⌘C to copy, or use Download.",
              );
            }
          }}
        >
          Copy {resource === "prompt" ? "prompt" : "template"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([value], { type: "text/markdown;charset=utf-8" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download =
              resource === "prompt"
                ? "teachcode-ai-prompt.md"
                : "teachcode-template.md";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download
        </button>
        <p role="status" className="text-sm text-teal-800">
          {status}
        </p>
      </div>
    </div>
  );
}
