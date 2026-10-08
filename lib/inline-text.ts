export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "strike"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

type Match = { end: number; node: InlineNode };

const wrapMarkers = {
  bold: "**",
  strike: "~~",
  underline: "++",
} as const;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  let plain = 0;
  const flush = (to: number) => {
    if (to > plain) nodes.push({ type: "text", text: text.slice(plain, to) });
  };
  while (i < text.length) {
    const match = matchAt(text, i);
    if (!match) {
      i += 1;
      continue;
    }
    flush(i);
    nodes.push(match.node);
    i = match.end;
    plain = i;
  }
  flush(text.length);
  return nodes;
}

function matchAt(text: string, i: number): Match | null {
  const c = text[i];
  if (c === "`") return matchCode(text, i);
  if (c === "*") return matchWrap(text, i, "bold");
  if (c === "~") return matchWrap(text, i, "strike");
  if (c === "+") return matchWrap(text, i, "underline");
  if (c === "[") return matchLink(text, i);
  return null;
}

function matchCode(text: string, i: number): Match | null {
  if (text[i] !== "`" || text[i - 1] === "`" || text[i + 1] === "`")
    return null;
  const close = text.indexOf("`", i + 1);
  if (close <= i + 1 || text[close + 1] === "`") return null;
  const content = text.slice(i + 1, close);
  if (content.includes("\n")) return null;
  return { end: close + 1, node: { type: "code", text: content } };
}

function matchWrap(
  text: string,
  i: number,
  type: keyof typeof wrapMarkers,
): Match | null {
  const marker = wrapMarkers[type];
  if (!text.startsWith(marker, i) || text[i - 1] === marker[0]) return null;
  const start = i + marker.length;
  const close = text.indexOf(marker, start);
  if (close <= start) return null;
  const content = text.slice(start, close);
  if (content.includes("\n") || /^\s|\s$/.test(content)) return null;
  return {
    end: close + marker.length,
    node: { type, children: parseInline(content) },
  };
}

function matchLink(text: string, i: number): Match | null {
  if (text[i] !== "[" || text[i - 1] === "!") return null;
  const labelEnd = text.indexOf("]", i + 1);
  if (labelEnd <= i + 1 || text[labelEnd + 1] !== "(") return null;
  const urlEnd = text.indexOf(")", labelEnd + 2);
  if (urlEnd === -1) return null;
  const label = text.slice(i + 1, labelEnd);
  const url = text.slice(labelEnd + 2, urlEnd);
  if (!label || label.includes("\n") || /\s/.test(url)) return null;
  const href = safeHref(url);
  if (!href) return null;
  return {
    end: urlEnd + 1,
    node: { type: "link", href, children: parseInline(label) },
  };
}

function hasUnsafeUrlChar(raw: string) {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code === 127) return true;
    if ("<>\"'`".includes(raw[i])) return true;
  }
  return false;
}

function safeHref(raw: string): string | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  if (hasUnsafeUrlChar(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
