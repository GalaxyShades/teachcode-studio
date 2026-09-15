"use client";
import {
  useState,
  useRef,
  useEffect,
  useId,
  createContext,
  useContext,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  defaults,
  blockTypes,
  validateDraft,
  type Block,
  type LessonDraft,
} from "@/lib/content";
import { parseLessonMarkdown, serializeLessonMarkdown } from "@/lib/markdown";
import { saveDraft, publishDraft, unpublishDraft } from "@/app/actions";
import { BlockRenderer } from "./BlockRenderer";
import { SortableList } from "./SortableList";
import { EditorCard, ActionMenu, cardNames, cardIcons } from "./EditorCard";
import { AuthoringGuide } from "./AuthoringGuide";
import { coursePath, lessonPath } from "@/lib/paths";
const advancedKeys = new Set([
  "explanation",
  "visible",
  "context",
  "functions",
  "execution",
  "runtimePath",
  "expectedOutput",
  "solution",
  "checkScript",
  "styleConfig",
  "randomisation",
  "reviewPrinciples",
  "rubric",
  "constraints",
  "keyIdeas",
  "misconceptions",
  "variants",
]);
const labels: Record<string, string> = {
  visible: "Show to learners",
  markdown: "Text",
  statement: "Instructions",
  imageUrl: "Image URL",
  copyingAllowed: "Allow copying",
  chips: "Suggested questions",
  starterCode: "Starter code",
  checkScript: "Automated check (author only)",
  llmAllowed: "Allow LLM",
  runtimeScope: "Runtime scope",
  programmingLanguage: "Programming language",
  alt: "Alternative text",
  reviewPrinciples: "Review principles",
  expectedOutput: "Expected output",
};
const choices: Record<string, string[]> = {
  language: ["python", "r"],
  execution: ["browser", "server"],
  track: ["Python", "R", "literacy"],
  level: ["year 1", "year 2", "advanced"],
  mode: ["lesson", "exercise", "quiz"],
  programmingLanguage: ["", "Python", "R"],
  runtimeScope: ["per-step", "lesson-wide"],
  presentation: ["guided", "all-steps"],
};
function move<T>(items: T[], i: number, delta: number) {
  const next = [...items];
  const j = i + delta;
  if (j < 0 || j >= next.length) return items;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
function clone<T>(value: T): T {
  const copy = structuredClone(value);
  function ids(v: any) {
    if (!v || typeof v !== "object") return;
    if ("id" in v) v.id = crypto.randomUUID();
    Object.values(v).forEach((x) =>
      Array.isArray(x) ? x.forEach(ids) : ids(x),
    );
  }
  ids(copy);
  return copy;
}
function MarkdownField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const fieldId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const inserts: [string, string, string][] = [
    ["Heading", "## ", ""],
    ["Paragraph", "\n\n", ""],
    ["Bold", "**", "**"],
    ["Italic", "*", "*"],
    ["Link", "[", "](https://example.edu)"],
    ["Bullets", "- ", ""],
    ["Numbered", "1. ", ""],
    ["Quote", "> ", ""],
    ["Table", "| Column | Value |\n| --- | --- |\n| ", " |"],
    ["Inline code", "`", "`"],
    ["Code block", "```python\n", "\n```"],
    ["Rule", "\n---\n", ""],
  ];
  return (
    <div className="label block mt-3">
      <label htmlFor={fieldId}>{label}</label>
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="my-1 flex flex-wrap gap-1"
      >
        {inserts.map(([name, left, right]) => (
          <button
            key={name}
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => {
              const t = ref.current!,
                a = t.selectionStart,
                b = t.selectionEnd;
              onChange(
                value.slice(0, a) +
                  left +
                  value.slice(a, b) +
                  right +
                  value.slice(b),
              );
              requestAnimationFrame(() => {
                t.focus();
                t.setSelectionRange(a + left.length, b + left.length);
              });
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <textarea
        id={fieldId}
        ref={ref}
        className="field font-mono"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
const ValidationContext = createContext<string[]>([]);
function FieldError({ path }: { path: string }) {
  const normalized = path.replace(/^metadata\./, "");
  const errors = useContext(ValidationContext).filter(
    (e) => e.split(":")[0] === normalized,
  );
  return errors.length ? (
    <span className="mt-1 block text-sm text-red-700" role="alert">
      {errors.map((e) => e.slice(e.indexOf(":") + 1).trim()).join(". ")}
    </span>
  ) : null;
}
function Fields({
  value,
  onChange,
  path = "field",
}: {
  value: Record<string, any>;
  onChange: (v: any) => void;
  path?: string;
}) {
  return (
    <>
      {Object.entries(value)
        .filter(
          ([k]) =>
            ![
              "id",
              "type",
              "version",
              "sourceMarkdown",
              "steps",
              "advanced",
            ].includes(k),
        )
        .map(([key, v]) => {
          const label =
              (key === "markdown" && value.type === "quick-reference"
                ? "Reference text"
                : key === "markdown" && value.type !== "text"
                  ? "Existing notes"
                  : labels[key]) ??
              key.charAt(0).toUpperCase() +
                key.slice(1).replace(/([A-Z])/g, " $1"),
            set = (next: any) => onChange({ ...value, [key]: next }),
            id = `${path}.${key}`;
          if (Array.isArray(v))
            return (
              <fieldset key={key} id={id} className="mt-3 rounded border p-2">
                <legend>{label}</legend>
                {v.map((item, i) =>
                  typeof item === "object" ? (
                    <div key={item.id ?? i} className="my-2 border-b pb-2">
                      <Fields
                        value={item}
                        path={`${id}.${i}`}
                        onChange={(next) =>
                          set(v.map((x, j) => (j === i ? next : x)))
                        }
                      />
                      <button
                        className="btn-secondary"
                        onClick={() => set(v.filter((_, j) => j !== i))}
                      >
                        Remove {key === "choices" ? "option" : "function"}
                      </button>
                    </div>
                  ) : (
                    <input
                      aria-label={`${label} ${i + 1}`}
                      className="field"
                      key={i}
                      value={item}
                      onChange={(e) =>
                        set(v.map((x, j) => (j === i ? e.target.value : x)))
                      }
                    />
                  ),
                )}
                <button
                  className="btn-secondary"
                  onClick={() =>
                    set([
                      ...v,
                      key === "choices"
                        ? {
                            id: crypto.randomUUID(),
                            text: "New option",
                            correct: false,
                          }
                        : key === "functions"
                          ? { name: "function()", summary: "" }
                          : "",
                    ])
                  }
                >
                  Add{" "}
                  {key === "choices"
                    ? "option"
                    : key === "functions"
                      ? "function"
                      : "tag"}
                </button>
                <FieldError path={id} />
              </fieldset>
            );
          if (typeof v === "object" && v !== null)
            return (
              <fieldset key={key} className="mt-3 border p-2">
                <legend>{label}</legend>
                <Fields path={id} value={v} onChange={set} />
                <FieldError path={id} />
              </fieldset>
            );
          if (typeof v === "boolean")
            return (
              <label id={id} key={key} className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={v}
                  onChange={(e) => set(e.target.checked)}
                />
                {label}
                <FieldError path={id} />
              </label>
            );
          const options =
            key === "mode" && value.type === "tutor-config"
              ? undefined
              : choices[key];
          if (options)
            return (
              <label key={key} htmlFor={id} className="label mt-3 block">
                {label}
                <select
                  id={id}
                  className="field"
                  value={v}
                  onChange={(e) => set(e.target.value)}
                >
                  {options.map((x) => (
                    <option key={x} value={x}>
                      {x || "None"}
                    </option>
                  ))}
                </select>
                <FieldError path={id} />
              </label>
            );
          if (key === "markdown" && value.type === "text")
            return (
              <div id={id} key={key}>
                <MarkdownField label={label} value={v ?? ""} onChange={set} />
              </div>
            );
          return (
            <label key={key} htmlFor={id} className="label mt-3 block">
              {label}
              {[
                "title",
                "slug",
                "imageUrl",
                "url",
                "filename",
                "alt",
                "language",
              ].includes(key) ? (
                <input
                  id={id}
                  className="field"
                  value={v ?? ""}
                  onChange={(e) => set(e.target.value)}
                />
              ) : (
                <textarea
                  id={id}
                  className={`field ${["code", "starterCode", "solution", "checkScript"].includes(key) ? "font-mono" : ""}`}
                  rows={3}
                  value={v ?? ""}
                  onChange={(e) => set(e.target.value)}
                />
              )}
              <FieldError path={id} />
            </label>
          );
        })}
    </>
  );
}
function withOptionalFields(b: Block): Block {
  return {
    ...b,
    ...(b.type === "worked-example"
      ? { title: b.title ?? "", expectedOutput: b.expectedOutput ?? "" }
      : {}),
    ...(b.type === "code-exercise"
      ? {
          solution: b.solution ?? "",
          checkScript: b.checkScript ?? "",
          expectedOutput: b.expectedOutput ?? "",
        }
      : {}),
    ...(b.type === "figure" ? { caption: b.caption ?? "" } : {}),
    ...(b.type === "data-asset" ? { runtimePath: b.runtimePath ?? "" } : {}),
  } as Block;
}
export default function LessonEditor({
  courseId,
  courseSlug,
  lessonId,
  initial,
  canPublish,
  resources,
}: {
  courseId: string;
  courseSlug: string;
  lessonId: string;
  initial: LessonDraft;
  canPublish: boolean;
  resources: { template: string; prompt: string };
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [draft, setDraft] = useState(initial),
    latest = useRef(initial),
    dirty = useRef(false),
    saving = useRef(false),
    paused = useRef(false);
  const [tab, setTab] = useState("rich"),
    [mobile, setMobile] = useState("editor"),
    [status, setStatus] = useState("Saved"),
    [busy, setBusy] = useState(false),
    [markdown, setMarkdown] = useState(
      initial.sourceMarkdown || serializeLessonMarkdown(initial),
    ),
    [parseErrors, setParseErrors] = useState<string[]>(
      initial.sourceMarkdown
        ? parseLessonMarkdown(initial.sourceMarkdown, initial).errors.map(
            (e) => `Line ${e.line}:${e.column}: ${e.message}`,
          )
        : [],
    );
  const [picker, setPicker] = useState<{ step: number; index: number } | null>(
      null,
    ),
    [remove, setRemove] = useState<(() => void) | null>(null),
    [collapsed, setCollapsed] = useState<Set<string>>(
      new Set(initial.steps.flatMap((s) => s.blocks.map((b) => b.id))),
    );
  const [activeStepId, setActiveStepId] = useState(initial.steps[0]?.id),
    [showPreview, setShowPreview] = useState(false);
  const activeStepIndex = Math.max(
    0,
    draft.steps.findIndex((s) => s.id === activeStepId),
  );
  const activeStep = draft.steps[activeStepIndex];
  const errors = [...parseErrors, ...validateDraft(draft)];
  function change(next: LessonDraft) {
    latest.current = next;
    dirty.current = true;
    setDraft(next);
    setStatus("Unsaved changes");
  }
  function steps(next: LessonDraft["steps"]) {
    change({ ...latest.current, steps: next });
  }
  function blocks(si: number, next: Block[]) {
    steps(
      latest.current.steps.map((s, i) =>
        i === si ? { ...s, blocks: next } : s,
      ),
    );
  }
  async function save(publish = false) {
    if (saving.current) return;
    if (publish && errors.length) return;
    saving.current = true;
    setBusy(true);
    setStatus(publish ? "Publishing…" : "Saving…");
    const snapshot = {
      ...latest.current,
      sourceMarkdown: parseErrors.length
        ? markdown
        : serializeLessonMarkdown(latest.current),
    };
    dirty.current = false;
    try {
      paused.current = false;
      const result = await (publish ? publishDraft : saveDraft)(
        courseId,
        lessonId,
        snapshot,
      );
      if ("error" in result) throw new Error(result.error);
      window.history.replaceState(
        null,
        "",
        lessonPath({ id: courseId, slug: courseSlug }, snapshot),
      );
      const next = { ...latest.current, version: result.version };
      latest.current = next;
      setDraft(next);
      setStatus(
        `${publish ? "Published · " : ""}Saved ${new Date(result.savedAt).toLocaleTimeString()} · ${result.editor}`,
      );
    } catch (e) {
      dirty.current = true;
      paused.current = true;
      setStatus(
        "Save failed: " + (e instanceof Error ? e.message : "Please retry"),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dirty.current && !saving.current && !paused.current) void save();
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, busy]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty.current || saving.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function parse(source: string) {
    setMarkdown(source);
    const parsed = parseLessonMarkdown(source, latest.current);
    setParseErrors(
      parsed.errors.map((e) => `Line ${e.line}:${e.column}: ${e.message}`),
    );
    if (parsed.draft)
      setCollapsed(
        new Set(parsed.draft.steps.flatMap((s) => s.blocks.map((b) => b.id))),
      );
    change(parsed.draft ?? { ...latest.current, sourceMarkdown: source });
  }
  function toggle(id: string) {
    setCollapsed(
      (previous) =>
        new Set(
          latest.current.steps
            .flatMap((s) => s.blocks.map((b) => b.id))
            .filter((key) => key !== id || !previous.has(id)),
        ),
    );
  }
  function addControl(si: number, index: number) {
    return (
      <button
        className="my-3 w-full rounded-lg border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-teal-800 hover:border-teal-600 hover:bg-teal-50"
        onClick={() => setPicker({ step: si, index })}
      >
        ＋ Add card
      </button>
    );
  }
  function focusError(error: string) {
    if (error.startsWith("Line ")) {
      setTab("markdown");
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>('textarea[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setCollapsed(new Set());
    const stepMatch = /^steps\.(\d+)/.exec(error);
    if (stepMatch) setActiveStepId(draft.steps[Number(stepMatch[1])]?.id);
    setTab("rich");
    requestAnimationFrame(() => {
      let path = error.split(":")[0];
      if (!path.startsWith("steps")) path = "metadata." + path;
      let target = document.getElementById(path);
      while (!target && path.includes(".")) {
        path = path.slice(0, path.lastIndexOf("."));
        target = document.getElementById(path);
      }
      if (!target) return;
      document.querySelectorAll("details").forEach((d) => {
        if (d.contains(target)) d.open = true;
      });
      target.scrollIntoView({ block: "center" });
      (target.matches("input,textarea,select")
        ? target
        : (target.querySelector<HTMLElement>("input,textarea,select") ?? target)
      ).focus();
    });
  }
  return (
    <ValidationContext.Provider value={errors}>
      <main className="p-4" aria-busy={!ready}>
        <fieldset
          disabled={!ready}
          className="min-w-0"
          aria-label="Chapter editor"
        >
          <header
            className={`mx-auto mb-5 ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
          >
            <a
              href={coursePath({ id: courseId, slug: courseSlug })}
              className="text-teal-800 underline"
            >
              ← Course
            </a>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold">{draft.title}</h1>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => save()}
                >
                  Save draft
                </button>
                {canPublish && (
                  <>
                    <button
                      disabled={busy || !!errors.length}
                      className="btn-primary"
                      onClick={() => save(true)}
                    >
                      Publish
                    </button>
                    <ActionMenu label="Chapter actions">
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          setRemove(() => async () => {
                            await unpublishDraft(courseId, lessonId);
                            window.location.reload();
                          })
                        }
                      >
                        Unpublish
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          setRemove(() => async () => {
                            await unpublishDraft(courseId, lessonId, true);
                            window.location.href = coursePath({
                              id: courseId,
                              slug: courseSlug,
                            });
                          })
                        }
                      >
                        Archive
                      </button>
                    </ActionMenu>
                  </>
                )}
              </div>
            </div>
            <p
              role="status"
              aria-live="polite"
              className="my-2 break-words text-right text-sm"
            >
              {status}
            </p>
          </header>
          <section
            className={`mx-auto mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-100 bg-teal-50/70 p-4 ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
            aria-label="Authoring help"
          >
            <div>
              <h2 className="text-sm font-semibold text-teal-900">
                Have slides or a document?
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Start with a template or turn your source into a chapter with
                AI.
              </p>
            </div>
            <AuthoringGuide
              {...resources}
              template={resources.template.replace(
                'slug="component-reference"',
                `slug=${JSON.stringify(draft.slug)}`,
              )}
            />
          </section>
          {!!errors.length && (
            <section
              role="alert"
              className="mx-auto my-3 max-w-7xl rounded border border-red-300 bg-red-50 p-3"
            >
              <b>Fix these issues before publication</b>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    <button
                      className="underline text-left"
                      onClick={() => focusError(e)}
                    >
                      {e}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="my-2 flex gap-2 lg:hidden">
            <button
              className="btn-secondary"
              onClick={() => setMobile("editor")}
            >
              Editor
            </button>
            <button
              className="btn-secondary"
              onClick={() => setMobile("preview")}
            >
              Preview
            </button>
          </div>
          <div
            className={`mx-auto grid gap-6 ${showPreview ? "max-w-7xl lg:grid-cols-2" : "max-w-4xl"}`}
          >
            <section
              className={`min-w-0 ${mobile === "preview" ? "hidden lg:block" : ""}`}
            >
              <nav
                className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2"
                aria-label="Editor mode"
              >
                <button
                  aria-pressed={tab === "rich"}
                  className={tab === "rich" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab("rich")}
                >
                  Rich Editor
                </button>
                <button
                  aria-pressed={tab === "markdown"}
                  className={
                    tab === "markdown" ? "btn-primary" : "btn-secondary"
                  }
                  onClick={() => {
                    setTab("markdown");
                    if (!parseErrors.length)
                      setMarkdown(serializeLessonMarkdown(latest.current));
                  }}
                >
                  Markdown
                </button>
                <label className="btn-secondary cursor-pointer">
                  Import Markdown
                  <input
                    className="sr-only"
                    type="file"
                    accept=".md,.markdown,text/markdown,text/plain"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        parse(await file.text());
                        setTab("markdown");
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          parseErrors.length
                            ? markdown
                            : serializeLessonMarkdown(latest.current),
                        ],
                        { type: "text/markdown" },
                      ),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${draft.slug}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export
                </button>
                <button
                  className="btn-secondary ml-auto hidden lg:inline-flex"
                  aria-pressed={showPreview}
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? "Hide preview" : "Show preview"}
                </button>
              </nav>
              {tab === "markdown" ? (
                <label className="label mt-4 block">
                  Chapter Markdown
                  <textarea
                    className="field h-[650px] font-mono"
                    value={markdown}
                    onChange={(e) => parse(e.target.value)}
                    aria-invalid={!!parseErrors.length}
                  />
                </label>
              ) : (
                <>
                  <details className="mt-4">
                    <summary className="cursor-pointer font-semibold">
                      Chapter details
                    </summary>
                    <Fields value={draft} path="metadata" onChange={change} />
                  </details>
                  <nav
                    aria-label="Chapter steps"
                    className="my-5 flex flex-wrap items-center gap-2"
                  >
                    {draft.steps.map((step, index) => (
                      <button
                        key={step.id}
                        className={`rounded-full px-4 py-2 text-sm font-medium ${step.id === activeStep?.id ? "bg-teal-700 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100 border"}`}
                        aria-current={
                          step.id === activeStep?.id ? "step" : undefined
                        }
                        onClick={() => setActiveStepId(step.id)}
                      >
                        {index + 1}. {step.title}
                      </button>
                    ))}
                    <button
                      className="rounded-full px-3 py-2 text-sm text-teal-800 hover:bg-teal-50"
                      onClick={() => {
                        const step = {
                          id: crypto.randomUUID(),
                          title: `Step ${draft.steps.length + 1}`,
                          blocks: [],
                        };
                        steps([...draft.steps, step]);
                        setActiveStepId(step.id);
                      }}
                    >
                      ＋ Add step
                    </button>
                  </nav>
                  {activeStep &&
                    (() => {
                      const s = activeStep,
                        si = activeStepIndex;
                      return (
                        <section id={`steps.${si}`}>
                          <div className="mb-4 flex items-center gap-3">
                            <label className="min-w-0 flex-1">
                              <span className="sr-only">Step title</span>
                              <input
                                aria-label="Step title"
                                className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xl font-semibold hover:border-zinc-300 focus:bg-white"
                                value={s.title}
                                onChange={(e) =>
                                  steps(
                                    draft.steps.map((x, i) =>
                                      i === si
                                        ? { ...x, title: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <span className="text-xs text-zinc-500">
                              {s.blocks.length} cards
                            </span>
                            <ActionMenu label="Step actions">
                              <button
                                className="btn-secondary"
                                disabled={!si}
                                onClick={() => steps(move(draft.steps, si, -1))}
                              >
                                Move step earlier
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={si === draft.steps.length - 1}
                                onClick={() => steps(move(draft.steps, si, 1))}
                              >
                                Move step later
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => {
                                  const copy = clone(s);
                                  steps([
                                    ...draft.steps.slice(0, si + 1),
                                    copy,
                                    ...draft.steps.slice(si + 1),
                                  ]);
                                  setActiveStepId(copy.id);
                                  setCollapsed(
                                    new Set([
                                      ...collapsed,
                                      ...copy.blocks.map((b) => b.id),
                                    ]),
                                  );
                                }}
                              >
                                Duplicate step
                              </button>
                              <button
                                className="btn-secondary text-red-700"
                                disabled={draft.steps.length === 1}
                                onClick={() =>
                                  setRemove(
                                    () => () =>
                                      steps(
                                        latest.current.steps.filter(
                                          (x) => x.id !== s.id,
                                        ),
                                      ),
                                  )
                                }
                              >
                                Delete step
                              </button>
                            </ActionMenu>
                          </div>
                          <p className="mb-4 text-xs text-zinc-500">
                            Drag a card to reorder. Select Edit to change its
                            content.
                          </p>
                          <SortableList
                            surface
                            label={(b) => `${cardNames[b.type]} card`}
                            items={s.blocks}
                            onChange={(next) => blocks(si, next)}
                            render={(b, bi) => (
                              <div
                                id={`steps.${si}.blocks.${bi}`}
                                tabIndex={-1}
                              >
                                <EditorCard
                                  block={b}
                                  index={bi}
                                  open={!collapsed.has(b.id)}
                                  onToggle={() => toggle(b.id)}
                                  actions={
                                    <>
                                      <button
                                        className="btn-secondary"
                                        disabled={!bi}
                                        onClick={() =>
                                          blocks(si, move(s.blocks, bi, -1))
                                        }
                                      >
                                        Move card up
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        disabled={bi === s.blocks.length - 1}
                                        onClick={() =>
                                          blocks(si, move(s.blocks, bi, 1))
                                        }
                                      >
                                        Move card down
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        onClick={() =>
                                          setPicker({ step: si, index: bi })
                                        }
                                      >
                                        Insert card above
                                      </button>
                                      <button
                                        className="btn-secondary"
                                        onClick={() => {
                                          const copy = clone(b);
                                          blocks(si, [
                                            ...s.blocks.slice(0, bi + 1),
                                            copy,
                                            ...s.blocks.slice(bi + 1),
                                          ]);
                                          setCollapsed(
                                            new Set([...collapsed, copy.id]),
                                          );
                                        }}
                                      >
                                        Duplicate card
                                      </button>
                                      <button
                                        className="btn-secondary text-red-700"
                                        onClick={() =>
                                          setRemove(
                                            () => () =>
                                              blocks(
                                                si,
                                                latest.current.steps[
                                                  si
                                                ].blocks.filter(
                                                  (x) => x.id !== b.id,
                                                ),
                                              ),
                                          )
                                        }
                                      >
                                        Delete card
                                      </button>
                                    </>
                                  }
                                >
                                  <Fields
                                    value={Object.fromEntries(
                                      Object.entries(
                                        withOptionalFields(b),
                                      ).filter(
                                        ([key]) =>
                                          !advancedKeys.has(key) &&
                                          !(
                                            key === "markdown" &&
                                            b.type !== "text" &&
                                            b.type !== "quick-reference"
                                          ),
                                      ),
                                    )}
                                    path={`steps.${si}.blocks.${bi}`}
                                    onChange={(next) =>
                                      blocks(
                                        si,
                                        s.blocks.map((x, i) =>
                                          i === bi ? { ...b, ...next } : x,
                                        ),
                                      )
                                    }
                                  />
                                  <details className="mt-4 border-t border-zinc-100 pt-3">
                                    <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">
                                      Additional settings
                                    </summary>
                                    <Fields
                                      value={{
                                        type: b.type,
                                        ...Object.fromEntries(
                                          Object.entries(
                                            withOptionalFields(b),
                                          ).filter(
                                            ([key, value]) =>
                                              advancedKeys.has(key) ||
                                              (key === "markdown" &&
                                                b.type !== "text" &&
                                                b.type !== "quick-reference" &&
                                                !!value),
                                          ),
                                        ),
                                      }}
                                      path={`steps.${si}.blocks.${bi}`}
                                      onChange={(next) =>
                                        blocks(
                                          si,
                                          s.blocks.map((x, i) =>
                                            i === bi ? { ...b, ...next } : x,
                                          ),
                                        )
                                      }
                                    />
                                    {"markdown" in b &&
                                      b.type !== "text" &&
                                      b.markdown && (
                                        <button
                                          className="mt-3 text-sm text-teal-800 underline"
                                          onClick={() => {
                                            const text = {
                                              ...defaults.text(),
                                              markdown: b.markdown,
                                            };
                                            blocks(si, [
                                              ...s.blocks.slice(0, bi),
                                              { ...b, markdown: "" },
                                              text,
                                              ...s.blocks.slice(bi + 1),
                                            ]);
                                            setCollapsed(
                                              new Set(
                                                latest.current.steps
                                                  .flatMap((step) =>
                                                    step.blocks.map(
                                                      (card) => card.id,
                                                    ),
                                                  )
                                                  .filter(
                                                    (id) => id !== text.id,
                                                  ),
                                              ),
                                            );
                                          }}
                                        >
                                          Move this text into a Markdown text
                                          card
                                        </button>
                                      )}
                                    <label className="mt-3 flex gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={b.advanced ?? false}
                                        onChange={(e) =>
                                          blocks(
                                            si,
                                            s.blocks.map((x, i) =>
                                              i === bi
                                                ? {
                                                    ...x,
                                                    advanced: e.target.checked,
                                                  }
                                                : x,
                                            ),
                                          )
                                        }
                                      />
                                      Mark as advanced
                                    </label>
                                  </details>
                                </EditorCard>
                              </div>
                            )}
                          />
                          {!s.blocks.length && (
                            <div className="rounded-xl border border-dashed p-8 text-center">
                              <h3 className="font-medium">Start with a card</h3>
                              <p className="mt-2 text-sm text-zinc-500">
                                Add Markdown text, a question, or a code
                                exercise.
                              </p>
                            </div>
                          )}
                          {addControl(si, s.blocks.length)}
                        </section>
                      );
                    })()}
                </>
              )}
            </section>
            <aside
              className={`card min-w-0 self-start p-6 ${mobile === "editor" ? "hidden" : ""} ${showPreview ? "lg:block" : "lg:hidden"}`}
            >
              <p className="text-sm font-semibold text-teal-800">
                LEARNER PREVIEW
              </p>
              <h2 className="mt-2 text-2xl font-bold">{draft.title}</h2>
              <p className="my-3">{draft.description}</p>
              {[activeStep].filter(Boolean).map((s) => (
                <section key={s.id} className="my-6">
                  <h3 className="mb-4 text-xl font-bold">{s.title}</h3>
                  {s.blocks.map((b) => (
                    <div className="my-4" key={b.id}>
                      <BlockRenderer block={b} />
                    </div>
                  ))}
                </section>
              ))}
            </aside>
          </div>
          <Dialog.Root
            open={!!picker}
            onOpenChange={(open) => {
              if (!open) setPicker(null);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(95vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-6">
                <Dialog.Title className="text-xl font-bold">
                  Add a card
                </Dialog.Title>
                <Dialog.Description>
                  Choose a component, then edit its fields.
                </Dialog.Description>
                <div className="my-4 grid gap-2 sm:grid-cols-2">
                  {blockTypes.map((t) => (
                    <button
                      className="rounded-lg border p-3 text-left hover:bg-teal-50"
                      key={t}
                      onClick={() => {
                        if (picker) {
                          const list = latest.current.steps[picker.step].blocks;
                          const added = defaults[t]();
                          blocks(picker.step, [
                            ...list.slice(0, picker.index),
                            added,
                            ...list.slice(picker.index),
                          ]);
                          setCollapsed(
                            new Set(
                              latest.current.steps
                                .flatMap((step) => step.blocks.map((b) => b.id))
                                .filter((id) => id !== added.id),
                            ),
                          );
                        }
                        setPicker(null);
                      }}
                    >
                      <span aria-hidden="true">{cardIcons[t]} </span>
                      <b>{cardNames[t]}</b>
                      <p className="text-sm">
                        {
                          {
                            text: "Rich Markdown explanation",
                            task: "Task and function references",
                            "quick-reference": "Syntax and reference notes",
                            "worked-example": "Example code and commentary",
                            figure: "Accessible image and caption",
                            mcq: "Question with answer feedback",
                            "code-exercise": "Learner code and author checks",
                            reflection: "Prompt and review rubric",
                            "tutor-config": "Tutor behavior and constraints",
                            "data-asset": "Resource and runtime path",
                            "code-review": "Review purpose and criteria",
                          }[t]
                        }
                      </p>
                    </button>
                  ))}
                </div>
                <Dialog.Close className="btn-secondary">Cancel</Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Dialog.Root
            open={!!remove}
            onOpenChange={(open) => {
              if (!open) setRemove(null);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6">
                <Dialog.Title className="text-xl font-bold">
                  Confirm change
                </Dialog.Title>
                <Dialog.Description className="my-3">
                  This removes the selected content or changes its public
                  availability. Continue?
                </Dialog.Description>
                <div className="flex gap-2">
                  <Dialog.Close className="btn-secondary">Cancel</Dialog.Close>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      remove?.();
                      setRemove(null);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </fieldset>
      </main>
    </ValidationContext.Provider>
  );
}
