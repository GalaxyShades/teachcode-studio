import type { ReactNode } from "react";
import { parseInline, type InlineNode } from "@/lib/inline-text";

export function InlineText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={["whitespace-pre-wrap break-words", className]
        .filter(Boolean)
        .join(" ")}
    >
      {renderInline(parseInline(text))}
    </span>
  );
}

function renderInline(nodes: InlineNode[], keyPrefix = "n"): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "bold":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm font-normal"
          >
            {node.text}
          </code>
        );
      case "strike":
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case "underline":
        return <u key={key}>{renderInline(node.children, key)}</u>;
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            className="text-teal-800 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}
