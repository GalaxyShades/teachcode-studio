"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Block } from "@/lib/content";
import { CodeDisplay } from "./CodeDisplay";
import { CodeRunner } from "./CodeRunner";
const safeUrl = (url: string) => /^https?:\/\//i.test(url);
function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
function Mcq({ block }: { block: Extract<Block, { type: "mcq" }> }) {
  const [selected, setSelected] = useState<string[]>([]),
    [checked, setChecked] = useState(false);
  const correct = block.choices.every(
    (c) => selected.includes(c.id) === c.correct,
  );
  return (
    <fieldset className="rounded-lg border p-4">
      <legend className="font-semibold">{block.question}</legend>
      {block.choices.map((c) => (
        <label className="my-2 flex gap-2" key={c.id}>
          <input
            type={block.multiple ? "checkbox" : "radio"}
            name={block.id}
            checked={selected.includes(c.id)}
            onChange={() => {
              setChecked(false);
              setSelected(
                block.multiple
                  ? selected.includes(c.id)
                    ? selected.filter((x) => x !== c.id)
                    : [...selected, c.id]
                  : [c.id],
              );
            }}
          />
          {c.text}
        </label>
      ))}
      <button
        disabled={!selected.length}
        className="btn-primary mt-2"
        onClick={() => setChecked(true)}
      >
        Check answer
      </button>
      {checked && (
        <div role="status" className="mt-3">
          <b>{correct ? "Correct" : "Try again"}</b>
          <Markdown>{block.explanation}</Markdown>
        </div>
      )}
    </fieldset>
  );
}
export function BlockRenderer({ block }: { block: Block }) {
  if (!block.visible) return null;
  switch (block.type) {
    case "text":
      return <Markdown>{block.markdown}</Markdown>;
    case "task":
      return (
        <aside className="rounded-lg border-l-4 border-teal-700 bg-teal-50 p-4">
          <b>Task</b>
          <Markdown>{block.context}</Markdown>
          <Markdown>{block.statement}</Markdown>
          {!!block.functions.length && (
            <dl>
              {block.functions.map((f, i) => (
                <div key={i}>
                  <dt className="font-mono">{f.name}</dt>
                  <dd>{f.summary}</dd>
                </div>
              ))}
            </dl>
          )}
        </aside>
      );
    case "quick-reference":
      return (
        <aside className="rounded-lg bg-zinc-100 p-4">
          <h4 className="font-bold">{block.title}</h4>
          <Markdown>{block.markdown}</Markdown>
        </aside>
      );
    case "worked-example":
      return (
        <section>
          <h4 className="font-bold">{block.title}</h4>
          {block.runnable ? (
            <CodeRunner
              language={block.language}
              starter={block.code}
              expectedOutput={block.expectedOutput}
            />
          ) : (
            <CodeDisplay code={block.code} language={block.language} />
          )}
          <Markdown>{block.explanation}</Markdown>
        </section>
      );
    case "code-exercise":
      return (
        <section>
          <Markdown>{block.prompt}</Markdown>
          <CodeRunner
            language={block.language}
            starter={block.starterCode}
            execution={block.execution}
            expectedOutput={block.expectedOutput}
            check={block.checkScript}
          />
        </section>
      );
    case "figure":
      return (
        <figure>
          {safeUrl(block.imageUrl) ? (
            <img
              className="h-auto max-w-full rounded"
              src={block.imageUrl}
              alt={block.alt}
              loading="lazy"
            />
          ) : (
            <p>Image URL must use HTTPS or HTTP.</p>
          )}
          <figcaption>{block.caption}</figcaption>
          <Markdown>{block.markdown}</Markdown>
        </figure>
      );
    case "mcq":
      return <Mcq block={block} />;
    case "reflection":
      return (
        <label className="block">
          <Markdown>{block.prompt}</Markdown>
          <textarea aria-label="Your reflection" className="field" rows={4} />
        </label>
      );
    case "data-asset":
      return (
        <aside>
          <Markdown>{block.description}</Markdown>
          {safeUrl(block.url) ? (
            <a
              className="text-teal-800 underline"
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {block.filename} ↗
            </a>
          ) : (
            <p>Resource URL must use HTTP or HTTPS.</p>
          )}
        </aside>
      );
    case "tutor-config":
      return (
        <aside className="rounded bg-zinc-100 p-3 text-sm">
          Tutor: {block.mode} ·{" "}
          {block.llmAllowed ? "LLM allowed" : "LLM disabled"}
        </aside>
      );
    case "code-review":
      return (
        <aside>
          <h4>{block.title}</h4>
          <Markdown>{block.purpose}</Markdown>
        </aside>
      );
  }
}
