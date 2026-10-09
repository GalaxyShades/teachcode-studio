import { CmsError } from "./repository";

const textExtensions = new Set(["txt", "md", "markdown"]);

function extension(name: string) {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1);
}

function unreadable(name: string, detail?: string): never {
  const file = name.trim() || "file";
  throw new CmsError(
    400,
    detail ? `Could not read ${file}. ${detail}` : `Could not read ${file}.`,
  );
}

async function docxText(bytes: Uint8Array) {
  const loaded = (await import("mammoth")) as {
    extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    default?: {
      extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
  };
  const mammoth = loaded.extractRawText ? loaded : loaded.default;
  if (!mammoth?.extractRawText) throw new Error("Word support is unavailable.");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value ?? "";
}

async function pdfText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const pdf = await getDocumentProxy(data);
  const extracted = await extractText(pdf, { mergePages: true });
  return Array.isArray(extracted.text)
    ? extracted.text.join("\n")
    : extracted.text;
}

export async function extractSourceText(name: string, bytes: Uint8Array) {
  const file = name.trim() || "file";
  if (!bytes.byteLength) unreadable(file);
  const ext = extension(file);
  let text = "";
  try {
    if (textExtensions.has(ext))
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    else if (ext === "docx") text = await docxText(bytes);
    else if (ext === "pdf") text = await pdfText(bytes);
    else if (ext === "doc")
      unreadable(file, "Save the Word document as .docx and upload that.");
    else
      unreadable(
        file,
        "Use a .md, .txt, .markdown, .pdf, or .docx file.",
      );
  } catch (error) {
    if (error instanceof CmsError) throw error;
    unreadable(file);
  }
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) {
    if (ext === "pdf")
      throw new CmsError(
        400,
        `${file} looks like a scan with no selectable text and cannot be used.`,
      );
    unreadable(file);
  }
  return trimmed;
}

/** Files in selection order, then additional text, separated by a blank line. */
export function combineLessonSource(fileTexts: string[], additional: string) {
  const parts = fileTexts.map((text) => text.trim()).filter(Boolean);
  const extra = additional.trim();
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}
