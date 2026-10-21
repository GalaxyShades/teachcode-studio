const attachmentMarker = "\n\n[[attachments:";

/** Keep attachment filenames on a stored user message without a schema change. */
export function messageWithAttachments(content: string, filenames: string[]) {
  const names = filenames.map((name) => name.trim()).filter(Boolean);
  if (!names.length) return content;
  return `${content}${attachmentMarker}${JSON.stringify(names)}]]`;
}

/** Split a stored user message into text and attachment filenames. */
export function readMessageAttachments(content: string): {
  content: string;
  attachments: string[];
} {
  const index = content.lastIndexOf(attachmentMarker);
  if (index < 0) return { content, attachments: [] };
  const encoded = content.slice(index + attachmentMarker.length);
  if (!encoded.endsWith("]]")) return { content, attachments: [] };
  try {
    const parsed = JSON.parse(encoded.slice(0, -2));
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => typeof item !== "string")
    )
      return { content, attachments: [] };
    return { content: content.slice(0, index), attachments: parsed };
  } catch {
    return { content, attachments: [] };
  }
}
