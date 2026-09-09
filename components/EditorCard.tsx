"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { Block, BlockType } from "@/lib/content";
export const cardNames: Record<BlockType, string> = {
  text: "Markdown text",
  task: "Task",
  "quick-reference": "Quick reference",
  "worked-example": "Worked example",
  figure: "Image",
  mcq: "Multiple choice",
  "code-exercise": "Code exercise",
  reflection: "Reflection",
  "tutor-config": "Tutor settings",
  "data-asset": "Resource",
  "code-review": "Code review",
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
  "tutor-config": "✦",
  "data-asset": "↗",
  "code-review": "☷",
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
      return block.prompt;
    case "reflection":
      return block.prompt;
    case "tutor-config":
      return block.mode;
    case "data-asset":
      return block.filename;
    case "code-review":
      return block.title;
  }
}
export function ActionMenu({
  label,
  children,
}: {
  label: string;
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
      className="relative shrink-0"
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
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-lg text-zinc-500 hover:bg-zinc-100 [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div
        className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border bg-white p-1.5 shadow-lg [&>button]:w-full [&>button]:justify-start [&>button]:border-0 [&>button]:text-left"
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
export function EditorCard({
  block,
  index,
  open,
  onToggle,
  actions,
  children,
}: {
  block: Block;
  index: number;
  open: boolean;
  onToggle: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className={`rounded-xl border bg-white transition-colors ${open ? "border-teal-600 shadow-sm" : "border-zinc-200 hover:border-teal-400"}`}
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
          <p className="text-xs text-zinc-500">
            Card {index + 1}
            {!block.visible ? " · Hidden" : ""}
          </p>
        </div>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${open ? "bg-teal-50 text-teal-800" : "text-zinc-600 hover:bg-zinc-100"}`}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? "Done" : "Edit"}
        </button>
        <ActionMenu label={`Actions for card ${index + 1}`}>
          {actions}
        </ActionMenu>
      </header>
      {open ? (
        <div className="cursor-auto border-t border-zinc-100 px-4 pb-4">
          {children}
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600">
            {cardSummary(block)
              .replace(/^#{1,6}\s+/gm, "")
              .replace(/[*`]/g, "")
              .replace(/\s+/g, " ")
              .trim() || "No content yet"}
          </p>
        </div>
      )}
    </article>
  );
}
