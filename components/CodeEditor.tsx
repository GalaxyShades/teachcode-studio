"use client";
import { useRef } from "react";
import { highlightCode } from "./CodeDisplay";
export function CodeEditor({
  id,
  language,
  value,
  rows = 8,
  onChange,
  label,
}: {
  id?: string;
  language: string;
  value: string;
  rows?: number;
  onChange: (next: string) => void;
  label?: string;
}) {
  const backdrop = useRef<HTMLPreElement>(null);
  return (
    <div className="code-editor relative mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
      <pre
        ref={backdrop}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-sm leading-6 text-zinc-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <code
          className="block whitespace-pre-wrap break-words font-mono text-sm leading-6"
          dangerouslySetInnerHTML={{ __html: highlightCode(value, language) }}
        />
      </pre>
      <textarea
        id={id}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="relative block w-full resize-y overflow-auto bg-transparent px-3 py-2 font-mono text-sm leading-6 text-transparent caret-zinc-100 whitespace-pre-wrap break-words focus:ring-offset-zinc-950"
        rows={rows}
        value={value}
        onScroll={(event) => {
          const pre = backdrop.current;
          if (!pre) return;
          pre.scrollTop = event.currentTarget.scrollTop;
          pre.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
