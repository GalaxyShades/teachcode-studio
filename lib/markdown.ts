import {
  defaults,
  blockTypes,
  LessonSchema,
  BlockSchema,
  type Block,
  type LessonDraft,
} from "./content";
export type MarkdownError = { line: number; column: number; message: string };
export type ParseResult = { draft?: LessonDraft; errors: MarkdownError[] };
type Node = {
  name: string;
  attrs: Record<string, any>;
  body: string[];
  children: Node[];
  line: number;
};
const quote = (v: unknown) => JSON.stringify(v);
function attributes(raw: string, line: number, errors: MarkdownError[]) {
  const out: Record<string, any> = {};
  let i = 0;
  while (i < raw.length) {
    while (/\s/.test(raw[i] ?? "") && i < raw.length) i++;
    if (i === raw.length) break;
    const match = /^([\w-]+)=/.exec(raw.slice(i));
    if (!match) {
      errors.push({ line, column: i + 1, message: "Expected attribute=value" });
      break;
    }
    i += match[0].length;
    const value = /^("(?:\\.|[^"\\])*"|true|false|-?\d+(?:\.\d+)?)/.exec(
      raw.slice(i),
    );
    if (!value) {
      errors.push({
        line,
        column: i + 1,
        message: "Use quoted strings, booleans, or numbers for attributes",
      });
      break;
    }
    try {
      if (Object.hasOwn(out, match[1]))
        errors.push({
          line,
          column: i + 1,
          message: `Duplicate attribute ${match[1]}`,
        });
      out[match[1]] = JSON.parse(value[1]);
    } catch {
      errors.push({
        line,
        column: i + 1,
        message: "Invalid escaped attribute",
      });
    }
    i += value[0].length;
  }
  return out;
}
const body = (n: Node) => n.body.join("\n");
const textBody = (n: Node) =>
  n.attrs.format === "fenced" ? unfence(body(n)) : body(n);
const unfence = (s: string) => {
  const m = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*)\n\1$/.exec(s);
  return m ? m[2] : s;
};
export function parseLessonMarkdown(
  source: string,
  base: LessonDraft,
): ParseResult {
  const errors: MarkdownError[] = [],
    root: Node = { name: "root", attrs: {}, body: [], children: [], line: 1 },
    stack = [root];
  let fence = "";
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    const current = stack[stack.length - 1],
      fm = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      current.body.push(line);
      if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length)
        fence = "";
      return;
    }
    if (fm) {
      fence = fm[1];
      current.body.push(line);
      return;
    }
    if (line === ":::") {
      if (stack.length === 1)
        errors.push({
          line: i + 1,
          column: 1,
          message: "Unexpected closing directive",
        });
      else stack.pop();
      return;
    }
    const open = /^:::([\w-]+)(?:\{(.*)\})?$/.exec(line);
    if (open) {
      const n: Node = {
        name: open[1],
        attrs: attributes(open[2] ?? "", i + 1, errors),
        body: [],
        children: [],
        line: i + 1,
      };
      current.children.push(n);
      stack.push(n);
      return;
    }
    if (line.startsWith(":::"))
      errors.push({ line: i + 1, column: 1, message: "Malformed directive" });
    current.body.push(line);
  });
  for (const n of stack.slice(1))
    errors.push({ line: n.line, column: 1, message: `Unclosed :::${n.name}` });
  const meta = root.children.find((n) => n.name === "lesson");
  let draft: LessonDraft = { ...base, steps: [] };
  if (root.children.filter((n) => n.name === "lesson").length > 1)
    errors.push({
      line: 1,
      column: 1,
      message: "Only one lesson metadata directive is allowed",
    });
  if (meta) {
    const a = { ...meta.attrs };
    const allowed = new Set([
      ...Object.keys(LessonSchema.shape).filter(
        (k) => !["steps", "version", "sourceMarkdown"].includes(k),
      ),
      "schemaVersion",
    ]);
    for (const key of Object.keys(a))
      if (!allowed.has(key))
        errors.push({
          line: meta.line,
          column: 1,
          message: `Unknown lesson attribute ${key}`,
        });
    if (typeof a.tags === "string") {
      try {
        a.tags = JSON.parse(a.tags);
      } catch {
        errors.push({
          line: meta.line,
          column: 1,
          message: "tags must be a quoted JSON array",
        });
      }
    }
    delete a.schemaVersion;
    draft = { ...draft, ...a };
    if (
      meta.attrs.schemaVersion !== undefined &&
      meta.attrs.schemaVersion !== 1
    )
      errors.push({
        line: meta.line,
        column: 1,
        message:
          "Unsupported schemaVersion; source preserved for a future parser",
      });
  }
  const aliases: Record<string, string> = {
    note: "explanation",
    "automated-check": "checkScript",
    "style-configuration": "styleConfig",
    "review-principles": "reviewPrinciples",
    "expected-output": "expectedOutput",
    starter: "starterCode",
    solution: "solution",
    "system-prompt": "constraints",
    functions: "functions",
    advanced: "advanced",
  };
  function parseBlock(n: Node): Block | undefined {
    if (!blockTypes.includes(n.name as any)) {
      errors.push({
        line: n.line,
        column: 1,
        message: `Unknown component ${n.name}`,
      });
      return;
    }
    const b: any = {
      ...defaults[n.name as Block["type"]](),
      ...n.attrs,
      type: n.name,
    };
    const allowed = new Set(
      Object.keys(
        BlockSchema.options.find((s) => s.shape.type.value === n.name)!.shape,
      ),
    );
    for (const key of Object.keys(n.attrs))
      if (!allowed.has(key))
        errors.push({
          line: n.line,
          column: 1,
          message: `Unknown ${n.name} attribute ${key}`,
        });
    for (const child of n.children) {
      const key = aliases[child.name] ?? child.name;
      if (key === "functions") {
        b.functions = child.children.map((f) => ({
          name: f.attrs.name ?? "",
          summary: textBody(f),
        }));
        if (child.children.some((f) => f.name !== "function"))
          errors.push({
            line: child.line,
            column: 1,
            message: "functions contains only function directives",
          });
      } else if (key === "choices") {
        b.choices = child.children.map((c) => ({
          id: c.attrs.id ?? crypto.randomUUID(),
          text: textBody(c),
          correct: c.attrs.correct ?? false,
        }));
        if (child.children.some((c) => c.name !== "choice"))
          errors.push({
            line: child.line,
            column: 1,
            message: "choices contains only choice directives",
          });
      } else if (key === "rubric") {
        b.rubric = { keyIdeas: "", misconceptions: "", variants: "" };
        for (const f of child.children) {
          if (!(f.name in b.rubric))
            errors.push({
              line: f.line,
              column: 1,
              message: "Unknown rubric field",
            });
          else b.rubric[f.name] = textBody(f);
        }
      } else if (key === "advanced") {
        b.advanced = true;
        for (const f of child.children) {
          const k = aliases[f.name] ?? f.name;
          if (!allowed.has(k))
            errors.push({
              line: f.line,
              column: 1,
              message: `Unknown advanced field ${k}`,
            });
          else b[k] = textBody(f);
        }
      } else if (!allowed.has(key))
        errors.push({
          line: child.line,
          column: 1,
          message: `Unknown ${n.name} field ${child.name}`,
        });
      else {
        if (child.children.length)
          errors.push({
            line: child.line,
            column: 1,
            message:
              "Unexpected nested directive in text field; use a code fence for literal directives",
          });
        b[key] = child.attrs.format
          ? textBody(child)
          : ["code", "starterCode", "solution", "checkScript"].includes(key)
            ? unfence(body(child))
            : body(child);
      }
    }
    const raw = body(n);
    if (raw.trim()) {
      const primary: Record<string, string> = {
        text: "markdown",
        task: "statement",
        "quick-reference": "markdown",
        figure: "markdown",
        reflection: "prompt",
        "code-exercise": "prompt",
        mcq: "question",
        "worked-example": "code",
        "data-asset": "description",
      };
      if (primary[n.name]) b[primary[n.name]] = n.name === "worked-example" ? unfence(raw) : raw;
      else
        errors.push({
          line: n.line,
          column: 1,
          message: "Use named fields inside this component",
        });
    }
    const parsed = BlockSchema.safeParse(b);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        errors.push({
          line: n.line,
          column: 1,
          message: `${issue.path.join(".")}: ${issue.message}`,
        });
      return;
    }
    return parsed.data;
  }
  for (const n of root.children) {
    if (n.name === "lesson") continue;
    if (n.name !== "step") {
      errors.push({
        line: n.line,
        column: 1,
        message: "Only lesson and step directives are allowed at top level",
      });
      continue;
    }
    if (n.body.some((l) => l.trim()))
      errors.push({
        line: n.line,
        column: 1,
        message: "Put step content inside a component directive",
      });
    draft.steps.push({
      id: n.attrs.id ?? crypto.randomUUID(),
      title: n.attrs.title ?? "",
      blocks: n.children.map(parseBlock).filter((b): b is Block => !!b),
    });
  }
  if (root.body.some((l) => l.trim() && !l.startsWith("#")))
    errors.push({
      line: 1,
      column: 1,
      message: "Content outside a directive is not allowed",
    });
  const result = LessonSchema.safeParse(draft);
  if (!result.success)
    for (const issue of result.error.issues)
      errors.push({
        line: 1,
        column: 1,
        message: `${issue.path.join(".")}: ${issue.message}`,
      });
  return errors.length
    ? { errors }
    : { draft: { ...result.data!, sourceMarkdown: source }, errors };
}
function attrs(value: Record<string, unknown>) {
  return (
    "{" +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${quote(v)}`)
      .join(" ") +
    "}"
  );
}
function field(
  name: string,
  text: string,
  attributes: Record<string, unknown> = {},
) {
  // A long literal fence protects directive-looking Markdown while preserving every byte.
  if (
    text
      .split("\n")
      .some((l) => l.startsWith(":::") || /^\s*(`{3,}|~{3,})/.test(l))
  ) {
    const fence = "`".repeat(
      Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)),
    );
    return `:::${name}${attrs({ ...attributes, format: "fenced" })}\n${fence}text\n${text}\n${fence}\n:::`;
  }
  return `:::${name}${attrs({ ...attributes, format: "raw" })}\n${text}\n:::`;
}
export function serializeLessonMarkdown(draft: LessonDraft) {
  const {
    steps,
    version: _version,
    sourceMarkdown: _sourceMarkdown,
    ...meta
  } = draft;
  return (
    `:::lesson${attrs({ ...meta, tags: JSON.stringify(meta.tags), schemaVersion: 1 })}\n:::\n\n` +
    steps
      .map(
        (s) =>
          `:::step${attrs({ id: s.id, title: s.title })}\n` +
          s.blocks
            .map((b) => {
              const primitive: Record<string, unknown> = {
                id: b.id,
                visible: b.visible,
                advanced: b.advanced ?? false,
              };
              const fields: string[] = [];
              for (const [k, v] of Object.entries(b)) {
                if (
                  ["id", "type", "visible", "advanced"].includes(k) ||
                  v === undefined
                )
                  continue;
                if (typeof v === "boolean") primitive[k] = v;
                else if (typeof v === "string") fields.push(field(k, v));
                else if (k === "functions")
                  fields.push(
                    ":::functions\n" +
                      (v as any[])
                        .map((f) =>
                          field("function", f.summary, { name: f.name }),
                        )
                        .join("\n") +
                      "\n:::",
                  );
                else if (k === "choices")
                  fields.push(
                    ":::choices\n" +
                      (v as any[])
                        .map((c) =>
                          field("choice", c.text, {
                            id: c.id,
                            correct: c.correct,
                          }),
                        )
                        .join("\n") +
                      "\n:::",
                  );
                else if (k === "rubric")
                  fields.push(
                    ":::rubric\n" +
                      Object.entries(v)
                        .map(([k, v]) => field(k, String(v)))
                        .join("\n") +
                      "\n:::",
                  );
              }
              return `:::${b.type}${attrs(primitive)}\n${fields.join("\n")}\n:::`;
            })
            .join("\n\n") +
          "\n:::",
      )
      .join("\n\n") +
    "\n"
  );
}
