import { createHash, randomBytes } from "node:crypto";

/** Request-scoped map of validation token → SHA-256 of the exact Markdown. */
export type ValidationGate = Map<string, string>;

export function createValidationGate(): ValidationGate {
  return new Map();
}

export function lessonMarkdownHash(markdown: string) {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

export function issueValidationToken(gate: ValidationGate, markdown: string) {
  const token = randomBytes(16).toString("hex");
  gate.set(token, lessonMarkdownHash(markdown));
  return token;
}

export function validationTokenMatches(
  gate: ValidationGate,
  token: string,
  markdown: string,
) {
  const bound = gate.get(token);
  return !!bound && bound === lessonMarkdownHash(markdown);
}
