export const wrapMarkers = {
  bold: "**",
  strike: "~~",
  underline: "++",
} as const;

export type WrapKind = keyof typeof wrapMarkers;

export type Edit = { from: number; to: number; text: string };

type Wrap = {
  from: number;
  to: number;
  innerStart: number;
  innerEnd: number;
};

function validWraps(text: string, marker: string): Wrap[] {
  const wraps: Wrap[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!text.startsWith(marker, i) || text[i - 1] === marker[0]) continue;
    const innerStart = i + marker.length;
    const close = text.indexOf(marker, innerStart);
    if (close <= innerStart) continue;
    const inner = text.slice(innerStart, close);
    if (inner.includes("\n") || /^\s|\s$/.test(inner)) continue;
    wraps.push({
      from: i,
      to: close + marker.length,
      innerStart,
      innerEnd: close,
    });
  }
  return wraps;
}

function pickWrap(wraps: Wrap[], start: number, end: number): Wrap | null {
  let best: Wrap | null = null;
  for (const wrap of wraps) {
    const cursor =
      start === end && start >= wrap.innerStart && start <= wrap.innerEnd;
    const inside =
      start < end && start >= wrap.innerStart && end <= wrap.innerEnd;
    const exact = start === wrap.from && end === wrap.to;
    if ((cursor || inside || exact) && (!best || wrap.from >= best.from))
      best = wrap;
  }
  return best;
}

export function wrapAround(
  text: string,
  start: number,
  end: number,
  marker: string,
): Wrap | null {
  return pickWrap(validWraps(text, marker), start, end);
}

function toggleFound(
  text: string,
  start: number,
  end: number,
  wraps: Wrap[],
  marker: string,
): Edit {
  const wrap = pickWrap(wraps, start, end);
  if (wrap)
    return {
      from: wrap.from,
      to: wrap.to,
      text: text.slice(wrap.innerStart, wrap.innerEnd),
    };
  return {
    from: start,
    to: end,
    text: marker + text.slice(start, end) + marker,
  };
}

export function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): Edit {
  return toggleFound(text, start, end, validWraps(text, marker), marker);
}

function validSingles(text: string, marker: "`" | "*"): Wrap[] {
  const wraps: Wrap[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== marker || text[i - 1] === marker || text[i + 1] === marker)
      continue;
    const innerStart = i + 1;
    let close = -1;
    for (let j = innerStart; j < text.length; j++) {
      if (text[j] !== marker) continue;
      if (text[j + 1] === marker) continue;
      close = j;
      break;
    }
    if (close <= innerStart) continue;
    const inner = text.slice(innerStart, close);
    if (inner.includes("\n") || /^\s|\s$/.test(inner)) continue;
    wraps.push({
      from: i,
      to: close + 1,
      innerStart,
      innerEnd: close,
    });
    i = close;
  }
  return wraps;
}

export function toggleItalic(text: string, start: number, end: number) {
  return toggleFound(text, start, end, validSingles(text, "*"), "*");
}

export function toggleCode(text: string, start: number, end: number) {
  return toggleFound(text, start, end, validSingles(text, "`"), "`");
}

function lineSpan(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let probe = end;
  if (end > start && text[end - 1] === "\n") probe = end - 1;
  const breakAt = text.indexOf("\n", Math.max(from, probe));
  const to = breakAt === -1 ? text.length : breakAt;
  return { from, to, lines: text.slice(from, to).split("\n") };
}

const headingPrefix = /^#{1,6} /;
const bulletPrefix = /^- /;
const numberedPrefix = /^\d+\. /;
const quotePrefix = /^>\s?/;
const blockPrefix = /^(?:#{1,6} |> ?|- |\d+\. )/;
const ruleLine = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

function contentLines(lines: string[]) {
  return lines.filter((line) => line.length > 0);
}

function everyContent(text: string, start: number, end: number, test: (line: string) => boolean) {
  const content = contentLines(lineSpan(text, start, end).lines);
  return content.length > 0 && content.every(test);
}

function mapLines(
  text: string,
  start: number,
  end: number,
  map: (line: string) => string,
): Edit {
  const { from, to, lines } = lineSpan(text, start, end);
  return { from, to, text: lines.map(map).join("\n") };
}

function stripBlock(line: string) {
  let next = line;
  for (let i = 0; i < 4; i++) {
    const stripped = next.replace(blockPrefix, "");
    if (stripped === next) return next;
    next = stripped;
  }
  return next;
}

export function bulletsActive(text: string, start: number, end: number) {
  return everyContent(text, start, end, (line) => bulletPrefix.test(line));
}

export function toggleBullets(text: string, start: number, end: number): Edit {
  const active = bulletsActive(text, start, end);
  return mapLines(text, start, end, (line) => {
    if (active) return line.replace(bulletPrefix, "");
    if (bulletPrefix.test(line)) return line;
    return `- ${stripBlock(line)}`;
  });
}

export function numberedActive(text: string, start: number, end: number) {
  return everyContent(text, start, end, (line) => numberedPrefix.test(line));
}

export function toggleNumbered(text: string, start: number, end: number): Edit {
  const active = numberedActive(text, start, end);
  let n = 1;
  return mapLines(text, start, end, (line) => {
    if (active) return line.replace(numberedPrefix, "");
    if (numberedPrefix.test(line)) {
      n += 1;
      return line;
    }
    const item = `${n}. ${stripBlock(line)}`;
    n += 1;
    return item;
  });
}

export function headingActive(text: string, start: number, end: number) {
  return everyContent(text, start, end, (line) => headingPrefix.test(line));
}

export function toggleHeading(text: string, start: number, end: number): Edit {
  const active = headingActive(text, start, end);
  return mapLines(text, start, end, (line) => {
    if (active) return line.replace(headingPrefix, "");
    if (headingPrefix.test(line)) return line;
    return `## ${stripBlock(line)}`;
  });
}

export function quoteActive(text: string, start: number, end: number) {
  return everyContent(text, start, end, (line) => quotePrefix.test(line));
}

export function toggleQuote(text: string, start: number, end: number): Edit {
  const active = quoteActive(text, start, end);
  return mapLines(text, start, end, (line) => {
    if (active) return line.replace(quotePrefix, "");
    if (quotePrefix.test(line)) return line;
    return `> ${stripBlock(line)}`;
  });
}

export function paragraphActive(text: string, start: number, end: number) {
  return everyContent(
    text,
    start,
    end,
    (line) =>
      !blockPrefix.test(line) &&
      !ruleLine.test(line) &&
      !line.startsWith("|") &&
      !line.startsWith("```"),
  );
}

export function toggleParagraph(text: string, start: number, end: number): Edit {
  return mapLines(text, start, end, stripBlock);
}

export function ruleActive(text: string, start: number, end: number) {
  return everyContent(text, start, end, (line) => ruleLine.test(line));
}

export function toggleRule(text: string, start: number, end: number): Edit {
  if (ruleActive(text, start, end))
    return mapLines(text, start, end, (line) => (ruleLine.test(line) ? "" : line));
  const inner = text.slice(start, end);
  return { from: start, to: end, text: `\n---\n${inner}` };
}

export function insertTable(text: string, start: number, end: number): Edit {
  const inner = text.slice(start, end);
  return {
    from: start,
    to: end,
    text: `| Column | Value |\n| --- | --- |\n| ${inner} |`,
  };
}

export type FenceSpan = {
  from: number;
  to: number;
  innerStart: number;
  innerEnd: number;
};

const fenceLine = /^```[\w+-]*\s*$/;

export function codeBlockAround(
  text: string,
  start: number,
  end: number,
): FenceSpan | null {
  const fences: { from: number; to: number }[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    if (fenceLine.test(line))
      fences.push({ from: offset, to: offset + line.length });
    offset += line.length + 1;
  }
  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i];
    const close = fences[i + 1];
    const innerStart = Math.min(open.to + 1, text.length);
    const innerEnd = Math.max(innerStart, close.from - 1);
    const cursor = start === end && start >= open.from && start <= close.to;
    const inside = start < end && start >= open.from && end <= close.to;
    if (cursor || inside)
      return { from: open.from, to: close.to, innerStart, innerEnd };
  }
  return null;
}

export function toggleCodeBlock(text: string, start: number, end: number): Edit {
  const fence = codeBlockAround(text, start, end);
  if (fence)
    return {
      from: fence.from,
      to: fence.to,
      text: text.slice(fence.innerStart, fence.innerEnd),
    };
  const inner = text.slice(start, end);
  const lead = start > 0 && text[start - 1] !== "\n" ? "\n" : "";
  const tail = end < text.length && text[end] !== "\n" ? "\n" : "";
  return {
    from: start,
    to: end,
    text: `${lead}\`\`\`python\n${inner}\n\`\`\`${tail}`,
  };
}

export function activeFormats(text: string, start: number, end: number) {
  return {
    bold: Boolean(wrapAround(text, start, end, wrapMarkers.bold)),
    italic: Boolean(pickWrap(validSingles(text, "*"), start, end)),
    strike: Boolean(wrapAround(text, start, end, wrapMarkers.strike)),
    underline: Boolean(wrapAround(text, start, end, wrapMarkers.underline)),
    code: Boolean(pickWrap(validSingles(text, "`"), start, end)),
    bullet: bulletsActive(text, start, end),
    numbered: numberedActive(text, start, end),
    heading: headingActive(text, start, end),
    quote: quoteActive(text, start, end),
    paragraph: paragraphActive(text, start, end),
    codeBlock: Boolean(codeBlockAround(text, start, end)),
    rule: ruleActive(text, start, end),
    link: Boolean(linkAt(text, start, end)),
  };
}

export type LinkSpan = {
  from: number;
  to: number;
  title: string;
  url: string;
};

export function linkAt(
  text: string,
  start: number,
  end: number,
): LinkSpan | null {
  const pattern = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let found: LinkSpan | null = null;
  for (const match of text.matchAll(pattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    const cursor = start === end && start >= from && start <= to;
    const inside = start < end && start >= from && end <= to;
    if (cursor || inside)
      found = { from, to, title: match[1], url: match[2] };
  }
  return found;
}
