/** Turn LaTeX delimiters into the `$` / `$$` forms remark-math parses. Code stays literal. */
export function prepareLearnerMarkdown(source: string) {
  const blocks: string[] = [];
  let out = "";
  let i = 0;
  const mask = (text: string) => {
    const token = `\u0000${blocks.length}\u0000`;
    blocks.push(text);
    out += token;
  };
  while (i < source.length) {
    const fence = fenceAt(source, i);
    if (fence) {
      const end = fencedEnd(source, i, fence);
      mask(source.slice(i, end));
      i = end;
      continue;
    }
    if (source[i] === "`") {
      let width = 0;
      while (source[i + width] === "`") width++;
      const close = source.indexOf("`".repeat(width), i + width);
      if (close !== -1) {
        const end = close + width;
        mask(source.slice(i, end));
        i = end;
        continue;
      }
    }
    out += source[i];
    i++;
  }
  const converted = out
    .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_match, body: string) =>
      displayMath(body),
    )
    .replace(
      /(?<!\\)\\\(([\s\S]*?)\\\)/g,
      (_match, body: string) => `$${body}$`,
    )
    .replace(/(?<!\\)\$\$([^\n]*?)\$\$/g, (match, body: string) =>
      body.trim() ? displayMath(body) : match,
    );
  return restoreMaskedBlocks(converted, blocks);
}

function restoreMaskedBlocks(source: string, blocks: string[]) {
  let result = "";
  for (let i = 0; i < source.length; ) {
    if (source[i] !== "\u0000") {
      result += source[i];
      i++;
      continue;
    }
    const close = source.indexOf("\u0000", i + 1);
    if (close === -1) {
      result += source.slice(i);
      break;
    }
    const index = Number(source.slice(i + 1, close));
    result += blocks[index] ?? "";
    i = close + 1;
  }
  return result;
}

function displayMath(body: string) {
  return `\n\n$$\n${body.trim()}\n$$\n\n`;
}

function fenceAt(source: string, index: number) {
  if (index > 0 && source[index - 1] !== "\n") return "";
  const marker = source[index];
  if (marker !== "`" && marker !== "~") return "";
  let width = 0;
  while (source[index + width] === marker) width++;
  if (width < 3) return "";
  const lineEnd = source.indexOf("\n", index);
  const line = source.slice(index, lineEnd === -1 ? source.length : lineEnd);
  return /^(`{3,}|~{3,})[^`]*$/.test(line) || /^~{3,}[^~]*$/.test(line)
    ? marker.repeat(width)
    : "";
}

function fencedEnd(source: string, index: number, fence: string) {
  const close = source.indexOf(`\n${fence}`, index + fence.length);
  if (close === -1) return source.length;
  const end = close + 1 + fence.length;
  const newline = source.indexOf("\n", end);
  return newline === -1 ? source.length : newline + 1;
}
