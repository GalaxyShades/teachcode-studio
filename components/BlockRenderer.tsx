"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Block } from "@/lib/content";
import { prepareLearnerMarkdown } from "@/lib/learner-math";
import { markdownLinkHref } from "@/lib/link-href";
import { CodeDisplay } from "./CodeDisplay";
import { CodeRunner } from "./CodeRunner";
import { InlineText } from "./InlineText";
const safeUrl = (url: string) => /^https?:\/\//i.test(url);
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }]]}
        urlTransform={markdownLinkHref}
      >
        {prepareLearnerMarkdown(children)}
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
      <legend className="sr-only">Question</legend>
      <div className="font-semibold [&_.markdown>:first-child]:mt-0 [&_.markdown_pre]:font-normal">
        <Markdown>{block.question}</Markdown>
      </div>
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
          <InlineText text={c.text} />
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
export function BlockRenderer({
  block,
  embedded = false,
}: {
  block: Block;
  embedded?: boolean;
}) {
  if (!block.visible) return null;
  switch (block.type) {
    case "text":
      return <Markdown>{block.markdown}</Markdown>;
    case "task":
      return (
        <aside className="rounded-lg border-l-4 border-teal-700 bg-teal-50 p-4">
          <b>Task</b>
          <Markdown>{block.context}</Markdown>
          <InlineText text={block.statement} className="my-3 block" />
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
        <aside className={embedded ? undefined : "rounded-lg bg-zinc-100 p-4"}>
          <h4 className="font-bold">
            <InlineText text={block.title} />
          </h4>
          <Markdown>{block.markdown}</Markdown>
        </aside>
      );
    case "worked-example":
      return (
        <section>
          <h4 className="font-bold">
            <InlineText text={block.title} />
          </h4>
          {block.runnable ? (
            <CodeRunner language={block.language} starter={block.code} />
          ) : (
            <CodeDisplay code={block.code} language={block.language} />
          )}
          <Markdown>{block.explanation}</Markdown>
          {block.expectedOutput ? (
            <div className="mt-3">
              <p className="font-semibold">Expected output</p>
              <pre className="whitespace-pre-wrap">{block.expectedOutput}</pre>
            </div>
          ) : null}
        </section>
      );
    case "code-exercise":
      return (
        <section>
          <InlineText text={block.instructions} className="block" />
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
          <figcaption>
            <InlineText text={block.caption} />
          </figcaption>
          <Markdown>{block.markdown}</Markdown>
        </figure>
      );
    case "mcq":
      return <Mcq block={block} />;
    case "reflection":
      return (
        <label className="block">
          <InlineText text={block.prompt} className="mb-2 block" />
          <textarea aria-label="Your reflection" className="field" rows={4} />
        </label>
      );
    case "data-asset":
      return (
        <aside>
          <InlineText text={block.description} className="block" />
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
  }
}
