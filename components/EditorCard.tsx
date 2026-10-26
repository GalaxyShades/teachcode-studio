"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { Block, BlockType } from "@/lib/content";
import { BlockRenderer, Markdown } from "./BlockRenderer";
export const cardNames: Record<BlockType, string> = {
  text: "Markdown text",
  task: "Task",
  "quick-reference": "Quick reference",
  "worked-example": "Worked example",
  figure: "Image",
  mcq: "Multiple choice",
  "code-exercise": "Code exercise",
  reflection: "Reflection",
  "data-asset": "Resource",
};
export const cardIcons: Record<BlockType, string> = {
  text: "¶",
  task: "✓",
  "quick-reference": "≡",
  "worked-example": "⌘",
  figure: "▧",
  mcq: "?",
  "code-exercise": "⌨",
  reflection: "✎",
  "data-asset": "↗",
};
export function cardSummary(block: Block) {
  switch (block.type) {
    case "text":
      return block.markdown;
    case "task":
      return block.statement;
    case "quick-reference":
      return block.title || block.markdown;
    case "worked-example":
      return block.title || block.code;
    case "figure":
      return block.caption || block.alt || "Add an image";
    case "mcq":
      return block.question;
    case "code-exercise":
      return block.instructions;
    case "reflection":
      return block.prompt;
    case "data-asset":
      return block.filename;
  }
}
export function ActionMenu({
  label,
  text,
  className,
  children,
}: {
  label: string;
  /** Visible trigger. Card menus stay icon-only when this is omitted. */
  text?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={ref}
      className={`group relative shrink-0 ${className ?? ""}`}
      data-no-drag
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          ref.current?.removeAttribute("open");
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={label}
        className={
          text
            ? "btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            : "flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-lg text-zinc-500 hover:bg-zinc-100 [&::-webkit-details-marker]:hidden"
        }
      >
        {text ?? "⋯"}
      </summary>
      <div
        className="absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-xl border bg-white p-1.5 shadow-lg group-open:block [&>button]:w-full [&>button]:justify-start [&>button]:border-0 [&>button]:text-left"
        onClick={(e) => {
          if ((e.target as Element).closest("button"))
            ref.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}
function HeaderIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
function TextPreview({
  markdown,
  expanded,
}: {
  markdown: string;
  expanded: boolean;
}) {
  if (!markdown.trim())
    return (
      <p className="text-sm leading-relaxed text-zinc-600">No content yet</p>
    );
  return (
    <div className={expanded ? undefined : "max-h-36 overflow-hidden"}>
      <Markdown>{markdown}</Markdown>
    </div>
  );
}
export function EditorCard({
  block,
  index,
  open,
  onToggle,
  previewExpanded = false,
  onPreviewToggle,
  highlighted = false,
  actions,
  children,
}: {
  block: Block;
  index: number;
  open: boolean;
  onToggle: () => void;
  previewExpanded?: boolean;
  onPreviewToggle?: () => void;
  highlighted?: boolean;
  actions: ReactNode;
  children: ReactNode;
}) {
  const previewToggle =
    !open && (block.type !== "text" || !!block.markdown.trim());
  const headerControl =
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium";
  const headerRest = highlighted
    ? "text-zinc-600 hover:bg-[#d0dced] hover:text-zinc-800"
    : "text-zinc-600 hover:bg-[#e8eef5] hover:text-zinc-800";
  const headerSelected = "bg-[#d0dced] text-zinc-800 hover:bg-[#bccce3]";
  return (
    <article
      className={`rounded-xl border transition-colors ${highlighted ? `${open ? "border-teal-600 shadow-sm" : "border-zinc-200"} bg-[#e4ecf7]` : open ? "border-teal-600 bg-white shadow-sm" : "border-zinc-200 bg-white hover:border-teal-400"}`}
      data-card-id={block.id}
    >
      <header
        className="flex items-center gap-3 px-4 py-3"
        data-card-drag-surface
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-lg text-zinc-600"
          aria-hidden
        >
          {cardIcons[block.type]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{cardNames[block.type]}</h3>
          <p
            className={`text-xs ${highlighted ? "text-zinc-600" : "text-zinc-500"}`}
          >
            Card {index + 1}
            {!block.visible ? " · Hidden" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {previewToggle ? (
            <button
              type="button"
              className={`${headerControl} ${previewExpanded ? headerSelected : headerRest}`}
              aria-expanded={previewExpanded}
              data-preview-toggle
              onClick={() => onPreviewToggle?.()}
            >
              {previewExpanded ? (
                <HeaderIcon>
                  <path d="m6 15 6-6 6 6" />
                </HeaderIcon>
              ) : (
                <HeaderIcon>
                  <path d="m6 9 6 6 6-6" />
                </HeaderIcon>
              )}
              {previewExpanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
          <button
            type="button"
            className={`${headerControl} ${open ? headerSelected : headerRest}`}
            aria-expanded={open}
            data-card-toggle
            onClick={onToggle}
          >
            {open ? (
              "Done"
            ) : (
              <>
                <HeaderIcon>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </HeaderIcon>
                Edit
              </>
            )}
          </button>
          <ActionMenu label={`Actions for card ${index + 1}`}>
            {actions}
          </ActionMenu>
        </div>
      </header>
      {open ? (
        <div className="cursor-auto border-t border-zinc-100 px-4 pb-4">
          {children}
        </div>
      ) : (
        <div className="px-4 pb-4">
          {block.type === "text" ? (
            <TextPreview markdown={block.markdown} expanded={previewExpanded} />
          ) : previewExpanded ? (
            <BlockRenderer block={{ ...block, visible: true }} embedded />
          ) : (
            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600">
              {cardSummary(block)
                .replace(/^#{1,6}\s+/gm, "")
                .replace(/[*`]/g, "")
                .replace(/\s+/g, " ")
                .trim() || "No content yet"}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
