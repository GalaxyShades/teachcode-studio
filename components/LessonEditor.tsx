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
  type AssistantSettings,
  type Block,
  type LessonDraft,
} from "@/lib/content";
import { parseLessonMarkdown, serializeLessonMarkdown } from "@/lib/markdown";
import { saveDraft, publishDraft, unpublishDraft } from "@/app/actions";
import { BlockRenderer } from "./BlockRenderer";
import { SortableList } from "./SortableList";
import { EditorCard, ActionMenu, cardNames, cardIcons } from "./EditorCard";
import { VersionHistory } from "./VersionHistory";
import { coursePath, lessonPath } from "@/lib/paths";

function syncLessonAddress(path: string) {
  if (window.location.pathname === path) return;
  const current = window.history.state;
  window.history.replaceState(
    {
      ...(current && typeof current === "object" ? current : {}),
      __NA: true,
    },
    "",
    path,
  );
}

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
  "rubric",
  "constraints",
]);
const labels: Record<string, string> = {
  markdown: "Text",
  statement: "Instructions",
  imageUrl: "Image URL",
  suggestedQuestions: "Suggested questions",
  starterCode: "Starter code",
  checkScript: "Automated check (author only)",
  programmingLanguage: "Programming language",
  alt: "Alternative text",
  expectedOutput: "Expected output",
  additionalPenalties: "Additional penalties",
  ignoredIssues: "Ignored issues",
};
const hints: Record<string, string> = {
  checkScript:
    "Code that runs after the learner’s program and reports pass or fail. Only authors see this script.",
  additionalPenalties:
    "Extra review deductions, one per line. Learners do not see this list.",
  ignoredIssues:
    "Possible issues in other situations that the teacher does not want flagged for this exercise. Learners do not see this list.",
  solution: "A sample answer for authors. Learners do not see it.",
  expectedOutput:
    "What a correct run should print. Learners can open it from the code runner.",
  execution:
    "Browser runs the code in this page. Server execution is not available.",
  suggestedQuestions:
    "Questions the assistant can offer. Put one question on each line.",
  constraints:
    "Rules for the assistant, such as what it should avoid. Learners do not see this.",
};
function InfoHint({ label, text }: { label: string; text: string }) {
  const tipId = useId();
  return (
    <span className="group/hint relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 text-[10px] font-semibold leading-none text-zinc-600 hover:border-zinc-700 hover:text-zinc-900"
        aria-label={`About ${label}`}
        aria-describedby={tipId}
      >
        i
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-xs font-normal normal-case leading-snug text-white shadow-lg group-hover/hint:block group-focus-within/hint:block"
      >
        {text}
      </span>
    </span>
  );
}
function LabelWithHint({ label, hintKey }: { label: string; hintKey: string }) {
  const hint = hints[hintKey];
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {hint ? <InfoHint label={label} text={hint} /> : null}
    </span>
  );
}
const choices: Record<string, string[]> = {
  language: ["python", "r"],
  execution: ["browser", "server"],
  track: ["Python", "R", "literacy"],
  programmingLanguage: ["", "Python", "R"],
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
const noMarkupKeys = new Set([
  "slug",
  "imageUrl",
  "url",
  "runtimePath",
  "code",
  "starterCode",
  "solution",
  "checkScript",
  "additionalPenalties",
  "ignoredIssues",
  "keyIdeas",
  "misconceptions",
  "variants",
  "constraints",
  "suggestedQuestions",
  "filename",
  "name",
]);
const singleLineKeys = new Set(["title", "filename", "alt"]);
const headingKeys = new Set(["title"]);
function usesInlineMarkup(key: string) {
  return !noMarkupKeys.has(key) && !headingKeys.has(key);
}
type MarkupControl = HTMLInputElement | HTMLTextAreaElement;
function applyMarkup(
  el: MarkupControl,
  left: string,
  right: string,
  onChange: (next: string) => void,
  emptyInner = "",
) {
  el.focus();
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const current = el.value;
  const selected = current.slice(start, end);
  const inner = selected || emptyInner;
  const inserted = left + inner + right;
  const next = current.slice(0, start) + inserted + current.slice(end);
  // A React state write does not enter the field undo stack. insertText does.
  let applied = false;
  try {
    applied = document.execCommand("insertText", false, inserted);
  } catch {
    applied = false;
  }
  if (applied && el.value === next) {
    const tracker = (
      el as MarkupControl & {
        _valueTracker?: { setValue: (value: string) => void };
      }
    )._valueTracker;
    if (tracker) tracker.setValue(current);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else onChange(next);
  const from = start + left.length;
  const to = from + inner.length;
  requestAnimationFrame(() => {
    el.focus();
    const max = el.value.length;
    el.setSelectionRange(Math.min(from, max), Math.min(to, max));
  });
}
const inlineMarks: [string, string, string, string][] = [
  ["Bold", "B", "font-bold", "**"],
  ["Code", "code", "font-mono", "`"],
  ["Strikethrough", "S", "line-through", "~~"],
  ["Underline", "U", "underline", "++"],
];
const markupButtonClass =
  "rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs leading-none text-zinc-600 hover:border-teal-600 hover:text-teal-800";
function FormattingToolbar({
  label,
  fieldRef,
  onChange,
}: {
  label: string;
  fieldRef: { current: MarkupControl | null };
  onChange: (next: string) => void;
}) {
  function link() {
    const el = fieldRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const entered = window.prompt("Link URL (http or https)");
    el.focus();
    el.setSelectionRange(start, end);
    if (entered == null) return;
    const href = entered.trim();
    let ok = /^https?:\/\//i.test(href) && !/\s/.test(href);
    if (ok) {
      try {
        const url = new URL(href);
        ok =
          (url.protocol === "http:" || url.protocol === "https:") &&
          !!url.hostname;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      window.alert("Enter an http or https URL.");
      return;
    }
    applyMarkup(el, "[", `](${href})`, onChange, "link");
  }
  return (
    <div
      role="toolbar"
      aria-label={`${label} formatting`}
      className="flex flex-nowrap items-center gap-1.5"
    >
      {inlineMarks.map(([name, text, look, marker]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          className={`${markupButtonClass} ${look}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = fieldRef.current;
            if (el) applyMarkup(el, marker, marker, onChange);
          }}
        >
          {text}
        </button>
      ))}
      <button
        type="button"
        aria-label="Link"
        className={markupButtonClass}
        onMouseDown={(e) => e.preventDefault()}
        onClick={link}
      >
        link
      </button>
    </div>
  );
}
function InlineMarkupField({
  id,
  label,
  hintKey,
  value,
  multiline,
  onChange,
  rows = 3,
  mono = false,
  hideLabel = false,
}: {
  id: string;
  label: string;
  hintKey: string;
  value: string;
  multiline: boolean;
  onChange: (next: string) => void;
  rows?: number;
  mono?: boolean;
  hideLabel?: boolean;
}) {
  const ref = useRef<MarkupControl>(null);
  function setControl(node: MarkupControl | null) {
    ref.current = node;
  }
  return (
    <div className={hideLabel ? "mt-2" : "label mt-3 block"}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        <LabelWithHint label={label} hintKey={hintKey} />
      </label>
      <div className="mt-1 flex flex-col gap-2">
        <FormattingToolbar label={label} fieldRef={ref} onChange={onChange} />
        {multiline ? (
          <textarea
            id={id}
            ref={setControl}
            className={`field !mt-0${mono ? " font-mono" : ""}`}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            ref={setControl}
            className="field !mt-0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
      <FieldError path={id} />
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
              "visible",
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
                <legend>
                  <LabelWithHint label={label} hintKey={key} />
                </legend>
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
                  ) : usesInlineMarkup(key) ? (
                    <InlineMarkupField
                      key={i}
                      id={`${id}.${i}`}
                      label={`${label} ${i + 1}`}
                      hintKey={key}
                      value={item ?? ""}
                      multiline={false}
                      hideLabel
                      onChange={(next) =>
                        set(v.map((x, j) => (j === i ? next : x)))
                      }
                    />
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
                <legend>
                  <LabelWithHint label={label} hintKey={key} />
                </legend>
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
                <LabelWithHint label={label} hintKey={key} />
                <FieldError path={id} />
              </label>
            );
          const options = choices[key];
          if (options)
            return (
              <label key={key} htmlFor={id} className="label mt-3 block">
                <LabelWithHint label={label} hintKey={key} />
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
          if (usesInlineMarkup(key))
            return (
              <InlineMarkupField
                key={key}
                id={id}
                label={label}
                hintKey={key}
                value={v ?? ""}
                multiline={!singleLineKeys.has(key)}
                rows={key === "markdown" ? 4 : 3}
                mono={key === "markdown" && value.type === "text"}
                onChange={set}
              />
            );
          return (
            <label key={key} htmlFor={id} className="label mt-3 block">
              <LabelWithHint label={label} hintKey={key} />
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
              {key === "additionalPenalties" || key === "ignoredIssues" ? (
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  One item per line.
                </span>
              ) : null}
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
          additionalPenalties: b.additionalPenalties ?? "",
          ignoredIssues: b.ignoredIssues ?? "",
        }
      : {}),
    ...(b.type === "figure" ? { caption: b.caption ?? "" } : {}),
    ...(b.type === "data-asset" ? { runtimePath: b.runtimePath ?? "" } : {}),
  } as Block;
}
function AssistantForm({
  labelledBy,
  description,
  value,
  onChange,
}: {
  labelledBy: string;
  description: string;
  value: AssistantSettings;
  onChange: (next: AssistantSettings) => void;
}) {
  return (
    <div
      role="tabpanel"
      id={`${labelledBy}-panel`}
      aria-labelledby={labelledBy}
      className="rounded-xl border bg-white p-4"
    >
      <p className="text-sm text-zinc-600">{description}</p>
      <label className="label mt-3 block">
        <LabelWithHint label="Suggested questions" hintKey="suggestedQuestions" />
        <textarea
          className="field"
          rows={3}
          value={value.suggestedQuestions}
          onChange={(e) =>
            onChange({ ...value, suggestedQuestions: e.target.value })
          }
        />
      </label>
      <label className="label mt-3 block">
        <LabelWithHint label="Constraints" hintKey="constraints" />
        <textarea
          className="field"
          rows={3}
          value={value.constraints}
          onChange={(e) => onChange({ ...value, constraints: e.target.value })}
        />
      </label>
    </div>
  );
}
export default function LessonEditor({
  courseId,
  courseSlug,
  lessonId,
  initial,
  initialCourseAssistant,
  initialLessonAssistant,
  canPublish,
}: {
  courseId: string;
  courseSlug: string;
  lessonId: string;
  initial: LessonDraft;
  initialCourseAssistant: AssistantSettings;
  initialLessonAssistant: AssistantSettings;
  canPublish: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => setReady(true), []);
  const [draft, setDraft] = useState(initial),
    [courseAssistant, setCourseAssistant] = useState(initialCourseAssistant),
    [lessonAssistant, setLessonAssistant] = useState(initialLessonAssistant),
    courseAssistantRef = useRef(initialCourseAssistant),
    lessonAssistantRef = useRef(initialLessonAssistant),
    latest = useRef(initial),
    dirty = useRef(false),
    saving = useRef(false),
    paused = useRef(false);
  const [tab, setTab] = useState("rich"),
    [assistantScope, setAssistantScope] = useState<"lesson" | "course">(
      "lesson",
    ),
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
    [showPreview, setShowPreview] = useState(false),
    [pinnedId, setPinnedId] = useState<string | null>(null);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const activeStepIndex = Math.max(
    0,
    draft.steps.findIndex((s) => s.id === activeStepId),
  );
  const activeStep = draft.steps[activeStepIndex];
  const errors = [...parseErrors, ...validateDraft(draft)];
  function updateCourseAssistant(next: AssistantSettings) {
    courseAssistantRef.current = next;
    setCourseAssistant(next);
    dirty.current = true;
    setStatus("Unsaved changes");
  }
  function updateLessonAssistant(next: AssistantSettings) {
    lessonAssistantRef.current = next;
    setLessonAssistant(next);
    dirty.current = true;
    setStatus("Unsaved changes");
  }
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
        lessonAssistantRef.current,
        courseAssistantRef.current,
      );
      if ("error" in result) throw new Error(result.error);
      syncLessonAddress(
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
  async function restore(revisionId: string) {
    if (saving.current)
      throw new Error(
        "Wait for the current save to finish, then restore again.",
      );
    saving.current = true;
    setRestoring(true);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/courses/${courseId}/lessons/${lessonId}/history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionId, version: latest.current.version }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Restore failed");
      const next: LessonDraft = result.draft;
      if ("lessonAssistant" in result && result.lessonAssistant) {
        lessonAssistantRef.current = result.lessonAssistant;
        setLessonAssistant(result.lessonAssistant);
      }
      latest.current = next;
      dirty.current = false;
      paused.current = false;
      setDraft(next);
      setMarkdown(next.sourceMarkdown || serializeLessonMarkdown(next));
      setParseErrors([]);
      setActiveStepId(next.steps[0]?.id);
      setCollapsed(
        new Set(next.steps.flatMap((s) => s.blocks.map((b) => b.id))),
      );
      setPicker(null);
      syncLessonAddress(lessonPath({ id: courseId, slug: courseSlug }, next));
      setStatus("Restored to draft · Publish to make these changes public");
    } catch (e) {
      paused.current = true;
      throw e;
    } finally {
      saving.current = false;
      setRestoring(false);
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dirty.current && !saving.current && !paused.current) void save();
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, courseAssistant, lessonAssistant, busy]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty.current || saving.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const preview = previewPaneRef.current;
    const wide = window.matchMedia("(min-width: 1024px)");
    if (!preview || !showPreview || !wide.matches || mobile !== "editor") {
      setPinnedId(null);
      return;
    }
    let frame = 0;
    const sync = () => {
      if (!wide.matches) {
        setPinnedId(null);
        return;
      }
      const top = preview.getBoundingClientRect().top;
      const nodes = [
        ...preview.querySelectorAll<HTMLElement>("[data-component-id]"),
      ];
      if (!nodes.length) {
        setPinnedId(null);
        return;
      }
      // Activate the component nearest the top once its top enters this band.
      const lead = 100;
      let current = nodes[0];
      for (const node of nodes)
        if (node.getBoundingClientRect().top - top <= lead) current = node;
      const id = current.dataset.componentId ?? null;
      setPinnedId(id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    preview.addEventListener("scroll", onScroll, { passive: true });
    wide.addEventListener("change", onScroll);
    sync();
    return () => {
      preview.removeEventListener("scroll", onScroll);
      wide.removeEventListener("change", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [showPreview, activeStepId, draft, mobile, tab]);
  useEffect(() => {
    const editor = editorPaneRef.current;
    if (!editor || !pinnedId || !showPreview) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const card = editor.querySelector<HTMLElement>(
      `[data-component-id="${CSS.escape(pinnedId)}"]`,
    );
    if (!card) return;
    const gap = 32;
    const delta =
      card.getBoundingClientRect().top -
      editor.getBoundingClientRect().top -
      gap;
    if (Math.abs(delta) > 4) editor.scrollTo({ top: editor.scrollTop + delta });
  }, [pinnedId, showPreview]);
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
          disabled={!ready || restoring}
          className="min-w-0"
          aria-label="Lesson editor"
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <h1 className="min-w-0 basis-full break-words text-2xl font-bold sm:flex-1 sm:basis-0">
                {draft.title}
              </h1>
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
                    <ActionMenu label="Lesson actions">
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
            <VersionHistory
              status={status}
              endpoint={`/api/courses/${courseId}/lessons/${lessonId}/history`}
              busy={busy}
              onRestore={restore}
            />
          </header>
          <nav
            className={`mx-auto mb-5 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2 ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
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
              className={tab === "markdown" ? "btn-primary" : "btn-secondary"}
              onClick={() => {
                setTab("markdown");
                if (!parseErrors.length)
                  setMarkdown(serializeLessonMarkdown(latest.current));
              }}
            >
              Markdown
            </button>
            <button
              aria-pressed={tab === "assistant"}
              className={tab === "assistant" ? "btn-primary" : "btn-secondary"}
              onClick={() => setTab("assistant")}
            >
              Assistant
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
          {tab === "assistant" ? (
            <section
              className={`mx-auto mb-6 ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
              aria-label="Learning Assistant"
            >
              <div
                role="tablist"
                aria-label="Learning Assistant"
                className="mb-4 flex flex-wrap gap-2"
              >
                <button
                  id="assistant-lesson"
                  role="tab"
                  aria-selected={assistantScope === "lesson"}
                  aria-controls="assistant-lesson-panel"
                  className={
                    assistantScope === "lesson"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                  onClick={() => setAssistantScope("lesson")}
                >
                  This lesson
                </button>
                <button
                  id="assistant-course"
                  role="tab"
                  aria-selected={assistantScope === "course"}
                  aria-controls="assistant-course-panel"
                  className={
                    assistantScope === "course"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                  onClick={() => setAssistantScope("course")}
                >
                  Course
                </button>
              </div>
              {assistantScope === "lesson" ? (
                <AssistantForm
                  labelledBy="assistant-lesson"
                  description="These settings apply only to this lesson."
                  value={lessonAssistant}
                  onChange={updateLessonAssistant}
                />
              ) : (
                <AssistantForm
                  labelledBy="assistant-course"
                  description="These settings apply to every lesson in this course."
                  value={courseAssistant}
                  onChange={updateCourseAssistant}
                />
              )}
            </section>
          ) : (
            <>
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
                className={`mx-auto grid gap-6 ${showPreview ? "max-w-7xl lg:sticky lg:top-0 lg:z-10 lg:h-dvh lg:grid-cols-2 lg:items-stretch lg:overflow-hidden" : "max-w-4xl"}`}
              >
                <section
                  ref={editorPaneRef}
                  className={`min-w-0 lg:min-h-0 ${mobile === "preview" ? "hidden lg:block" : ""} ${showPreview ? "lg:h-full lg:overflow-y-auto lg:overscroll-contain" : ""}`}
                >
                  {tab === "markdown" ? (
                    <label className="label mt-4 block">
                      Lesson Markdown
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
                          Lesson details
                        </summary>
                        <Fields
                          value={draft}
                          path="metadata"
                          onChange={change}
                        />
                      </details>
                      <nav
                        aria-label="Lesson steps"
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
                                    key={s.id}
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
                                    onClick={() =>
                                      steps(move(draft.steps, si, -1))
                                    }
                                  >
                                    Move step earlier
                                  </button>
                                  <button
                                    className="btn-secondary"
                                    disabled={si === draft.steps.length - 1}
                                    onClick={() =>
                                      steps(move(draft.steps, si, 1))
                                    }
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
                                Drag a card to reorder. Select Edit to change
                                its content.
                              </p>
                              <SortableList
                                surface
                                label={(b) => `${cardNames[b.type]} card`}
                                items={s.blocks}
                                onChange={(next) => blocks(si, next)}
                                render={(b, bi) => (
                                  <div
                                    id={`steps.${si}.blocks.${bi}`}
                                    data-component-id={b.id}
                                    tabIndex={-1}
                                    className={
                                      showPreview && pinnedId === b.id
                                        ? "lg:sticky lg:top-8 lg:z-20"
                                        : undefined
                                    }
                                  >
                                    <EditorCard
                                      block={b}
                                      index={bi}
                                      highlighted={
                                        showPreview && pinnedId === b.id
                                      }
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
                                            disabled={
                                              bi === s.blocks.length - 1
                                            }
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
                                                new Set([
                                                  ...collapsed,
                                                  copy.id,
                                                ]),
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
                                                    b.type !==
                                                      "quick-reference" &&
                                                    !!value),
                                              ),
                                            ),
                                          }}
                                          path={`steps.${si}.blocks.${bi}`}
                                          onChange={(next) =>
                                            blocks(
                                              si,
                                              s.blocks.map((x, i) =>
                                                i === bi
                                                  ? { ...b, ...next }
                                                  : x,
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
                                              Move this text into a Markdown
                                              text card
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
                                                        advanced:
                                                          e.target.checked,
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
                                  <h3 className="font-medium">
                                    Start with a card
                                  </h3>
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
                      {showPreview && (
                        <div className="hidden h-[70vh] lg:block" aria-hidden />
                      )}
                    </>
                  )}
                </section>
                <aside
                  ref={previewPaneRef}
                  className={`min-w-0 lg:min-h-0 lg:pr-2 ${mobile === "editor" ? "hidden" : ""} ${showPreview ? "lg:block lg:h-full lg:overflow-y-auto lg:overscroll-contain" : "lg:hidden"}`}
                >
                  <p className="text-sm font-semibold text-teal-800">
                    LEARNER PREVIEW
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{draft.title}</h2>
                  <p className="my-3">{draft.description}</p>
                  {[activeStep].filter(Boolean).map((s) => (
                    <section key={s.id} className="my-6">
                      <h3 className="mb-4 text-xl font-bold">{s.title}</h3>
                      <div className="space-y-3">
                        {s.blocks
                          .filter((b) => b.visible)
                          .map((b) => (
                            <div
                              className={`w-full rounded-xl border p-4 shadow-sm ${showPreview && pinnedId === b.id ? "border-[#dce8ff] bg-[#f4f8ff]" : "border-zinc-200 bg-white"}`}
                              data-component-id={b.id}
                              key={b.id}
                            >
                              <BlockRenderer block={b} embedded />
                            </div>
                          ))}
                      </div>
                    </section>
                  ))}
                  {showPreview && (
                    <div className="hidden h-[70vh] lg:block" aria-hidden />
                  )}
                </aside>
              </div>
            </>
          )}
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
                            "data-asset": "Resource and runtime path",
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
