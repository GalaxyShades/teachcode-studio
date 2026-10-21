"use client";
import {
  useState,
  useRef,
  useEffect,
  useId,
  createContext,
  useContext,
} from "react";
import { flushSync } from "react-dom";
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
import { CodeEditor } from "./CodeEditor";
import { SortableList } from "./SortableList";
import { EditorCard, ActionMenu, cardNames, cardIcons } from "./EditorCard";
import { VersionHistory } from "./VersionHistory";
import { coursePath, lessonPath, withBase } from "@/lib/paths";
import {
  plannerContentChanged,
  type PlannerContentChange,
} from "@/lib/planner/events";
import {
  activeFormats,
  insertTable,
  linkAt,
  toggleBullets,
  toggleCode,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleNumbered,
  toggleParagraph,
  toggleQuote,
  toggleRule,
  toggleWrap,
  wrapMarkers,
  type WrapKind,
} from "@/lib/field-markup";

function syncLessonAddress(path: string) {
  const next = withBase(path);
  if (window.location.pathname === next) return;
  const current = window.history.state;
  window.history.replaceState(
    {
      ...(current && typeof current === "object" ? current : {}),
      __NA: true,
    },
    "",
    next,
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
const codeEditorKeys = new Set([
  "code",
  "starterCode",
  "solution",
  "checkScript",
]);
const headingKeys = new Set(["title"]);
function usesInlineMarkup(key: string) {
  return !noMarkupKeys.has(key) && !headingKeys.has(key);
}
type MarkupControl = HTMLInputElement | HTMLTextAreaElement;
function replaceRange(
  el: MarkupControl,
  from: number,
  to: number,
  inserted: string,
  onChange: (next: string) => void,
  selectFrom = from,
  selectTo = from + inserted.length,
) {
  el.focus();
  const current = el.value;
  const next = current.slice(0, from) + inserted + current.slice(to);
  el.setSelectionRange(from, to);
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
  requestAnimationFrame(() => {
    el.focus();
    const max = el.value.length;
    el.setSelectionRange(Math.min(selectFrom, max), Math.min(selectTo, max));
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
}
const markupButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900";
const pressedButtonClass = "bg-teal-100 text-teal-900";
const shortActions = [
  "bold",
  "code",
  "strike",
  "underline",
  "bullet",
  "numbered",
  "link",
] as const;
const markdownActions = [
  "heading",
  "paragraph",
  "bold",
  "italic",
  "strike",
  "underline",
  "link",
  "bullet",
  "numbered",
  "quote",
  "table",
  "code",
  "codeBlock",
  "rule",
] as const;
type BarAction = (typeof markdownActions)[number];
const actionNames: Record<BarAction, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  underline: "Underline",
  code: "Code",
  link: "Link",
  bullet: "Bullets",
  numbered: "Numbered list",
  quote: "Quote",
  table: "Table",
  codeBlock: "Code block",
  rule: "Horizontal rule",
};
function FormatIcon({ action }: { action: BarAction }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {action === "heading" ? (
        <>
          <path d="M6 5v14" />
          <path d="M18 5v14" />
          <path d="M6 12h12" />
        </>
      ) : action === "paragraph" ? (
        <>
          <path d="M13 4v16" />
          <path d="M17 4v16" />
          <path d="M13 4H9.5a4 4 0 0 0 0 8H13" />
        </>
      ) : action === "bold" ? (
        <>
          <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
          <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
        </>
      ) : action === "italic" ? (
        <>
          <path d="M19 4h-9" />
          <path d="M14 20H5" />
          <path d="m15 4-6 16" />
        </>
      ) : action === "strike" ? (
        <>
          <path d="M5 12h14" />
          <path d="M16 7c-.6-1.5-2-2.5-4-2.5-2.2 0-4 1.4-4 3.2 0 2.4 2.2 3.2 5 3.8" />
          <path d="M8 17c.6 1.5 2 2.5 4 2.5 2.2 0 4-1.4 4-3.2" />
        </>
      ) : action === "underline" ? (
        <>
          <path d="M6 4v6a6 6 0 0 0 12 0V4" />
          <path d="M5 20h14" />
        </>
      ) : action === "link" ? (
        <>
          <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
        </>
      ) : action === "bullet" ? (
        <>
          <path d="M10 6h10" />
          <path d="M10 12h10" />
          <path d="M10 18h10" />
          <path d="M4 6h.01" />
          <path d="M4 12h.01" />
          <path d="M4 18h.01" />
        </>
      ) : action === "numbered" ? (
        <>
          <path d="M11 6h9" />
          <path d="M11 12h9" />
          <path d="M11 18h9" />
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M6 14H4.2c1.2.4 1.8 1.1 1.8 2s-.6 1.6-1.8 2H4" />
        </>
      ) : action === "quote" ? (
        <>
          <path d="M8 17c-2 0-3-1.4-3-3.5V7h5v6H8" />
          <path d="M18 17c-2 0-3-1.4-3-3.5V7h5v6h-2" />
        </>
      ) : action === "table" ? (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
          <path d="M3.5 9.5h17" />
          <path d="M3.5 14.5h17" />
          <path d="M9.5 4.5v15" />
          <path d="M14.5 4.5v15" />
        </>
      ) : action === "code" ? (
        <>
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
        </>
      ) : action === "codeBlock" ? (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="m9 9-2.5 3L9 15" />
          <path d="m15 9 2.5 3L15 15" />
        </>
      ) : (
        <path d="M4 12h16" />
      )}
    </svg>
  );
}
function FormattingToolbar({
  label,
  fieldRef,
  onChange,
  variant = "short",
}: {
  label: string;
  fieldRef: { current: MarkupControl | null };
  onChange: (next: string) => void;
  variant?: "short" | "markdown";
}) {
  const tipId = useId();
  const [active, setActive] = useState(() => activeFormats("", 0, 0));
  const [linkEdit, setLinkEdit] = useState<{
    title: string;
    url: string;
    from: number;
    to: number;
    existing: boolean;
  } | null>(null);
  const [linkError, setLinkError] = useState("");
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const sync = () => {
      if (document.activeElement !== el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      setActive(activeFormats(el.value, start, end));
    };
    el.addEventListener("keyup", sync);
    el.addEventListener("mouseup", sync);
    el.addEventListener("select", sync);
    el.addEventListener("input", sync);
    el.addEventListener("focus", sync);
    document.addEventListener("selectionchange", sync);
    return () => {
      el.removeEventListener("keyup", sync);
      el.removeEventListener("mouseup", sync);
      el.removeEventListener("select", sync);
      el.removeEventListener("input", sync);
      el.removeEventListener("focus", sync);
      document.removeEventListener("selectionchange", sync);
    };
  }, [fieldRef]);
  function commit(
    edit: { from: number; to: number; text: string },
    selectFrom?: number,
    selectTo?: number,
  ) {
    const el = fieldRef.current;
    if (!el) return;
    if (el.value.slice(edit.from, edit.to) === edit.text) return;
    replaceRange(
      el,
      edit.from,
      edit.to,
      edit.text,
      onChange,
      selectFrom,
      selectTo,
    );
  }
  function applyWrap(kind: WrapKind | "italic" | "code") {
    const el = fieldRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const marker =
      kind === "italic" ? "*" : kind === "code" ? "`" : wrapMarkers[kind];
    const turningOn = !activeFormats(el.value, start, end)[kind];
    const edit =
      kind === "italic"
        ? toggleItalic(el.value, start, end)
        : kind === "code"
          ? toggleCode(el.value, start, end)
          : toggleWrap(el.value, start, end, marker);
    commit(
      edit,
      turningOn ? edit.from + marker.length : edit.from,
      turningOn
        ? edit.from + edit.text.length - marker.length
        : edit.from + edit.text.length,
    );
  }
  function applyBlock(
    kind: Exclude<BarAction, WrapKind | "italic" | "code" | "link">,
  ) {
    const el = fieldRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const value = el.value;
    if (kind === "codeBlock") {
      const turningOn = !activeFormats(value, start, end).codeBlock;
      const edit = toggleCodeBlock(value, start, end);
      const openAt = edit.text.indexOf("```python\n");
      const innerFrom = edit.from + openAt + "```python\n".length;
      commit(
        edit,
        turningOn ? innerFrom : edit.from,
        turningOn ? innerFrom + (end - start) : edit.from + edit.text.length,
      );
      return;
    }
    const edit =
      kind === "bullet"
        ? toggleBullets(value, start, end)
        : kind === "numbered"
          ? toggleNumbered(value, start, end)
          : kind === "heading"
            ? toggleHeading(value, start, end)
            : kind === "quote"
              ? toggleQuote(value, start, end)
              : kind === "paragraph"
                ? toggleParagraph(value, start, end)
                : kind === "rule"
                  ? toggleRule(value, start, end)
                  : insertTable(value, start, end);
    if (kind === "table") {
      const lead = "| Column | Value |\n| --- | --- |\n| ";
      commit(edit, start + lead.length, start + lead.length + (end - start));
      return;
    }
    commit(edit);
  }
  function openLink() {
    const el = fieldRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const existing = linkAt(el.value, start, end);
    setLinkError("");
    if (existing)
      setLinkEdit({
        title: existing.title,
        url: existing.url,
        from: existing.from,
        to: existing.to,
        existing: true,
      });
    else
      setLinkEdit({
        title: el.value.slice(start, end) || "link",
        url: "",
        from: start,
        to: end,
        existing: false,
      });
  }
  function applyLink() {
    const el = fieldRef.current;
    if (!el || !linkEdit) return;
    const url = linkEdit.url.trim();
    const title = linkEdit.title.trim() || "link";
    if (!url) {
      setLinkError("Enter a URL.");
      return;
    }
    const inserted = `[${title}](${url})`;
    replaceRange(
      el,
      linkEdit.from,
      linkEdit.to,
      inserted,
      onChange,
      linkEdit.from + 1,
      linkEdit.from + 1 + title.length,
    );
    setLinkEdit(null);
  }
  function removeLink() {
    const el = fieldRef.current;
    if (!el || !linkEdit?.existing) return;
    const title = linkEdit.title.trim() || linkEdit.title;
    replaceRange(el, linkEdit.from, linkEdit.to, title, onChange);
    setLinkEdit(null);
  }
  function pressedFor(action: BarAction) {
    if (action === "link") return active.link || linkEdit !== null;
    if (action === "table") return false;
    return active[action];
  }
  function run(action: BarAction) {
    if (action === "link") openLink();
    else if (
      action === "bold" ||
      action === "italic" ||
      action === "strike" ||
      action === "underline" ||
      action === "code"
    )
      applyWrap(action);
    else applyBlock(action);
  }
  const actions = variant === "markdown" ? markdownActions : shortActions;
  return (
    <div className="relative">
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="flex flex-nowrap items-center gap-1.5"
      >
        {actions.map((action) => {
          const name =
            action === "code" && variant === "markdown"
              ? "Inline code"
              : actionNames[action];
          const pressed = pressedFor(action);
          const toggles = action !== "table";
          const descriptionId = `${tipId}-${action}`;
          return (
            <span key={action} className="group/tip relative inline-flex">
              <button
                type="button"
                aria-label={name}
                aria-describedby={descriptionId}
                aria-pressed={toggles ? pressed : undefined}
                aria-expanded={
                  action === "link" ? linkEdit !== null : undefined
                }
                className={`${markupButtonClass} ${pressed && toggles ? pressedButtonClass : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(action)}
              >
                <FormatIcon action={action} />
              </button>
              <span
                id={descriptionId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-normal normal-case leading-none text-white shadow-lg group-hover/tip:block group-focus-within/tip:block"
              >
                {name}
              </span>
            </span>
          );
        })}
      </div>
      {linkEdit && (
        <div
          role="dialog"
          aria-label="Link"
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setLinkEdit(null);
            } else if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              applyLink();
            }
          }}
        >
          <label className="label block">
            Link title
            <input
              className="field"
              value={linkEdit.title}
              onChange={(event) =>
                setLinkEdit({ ...linkEdit, title: event.target.value })
              }
            />
          </label>
          <label className="label mt-2 block">
            URL
            <input
              className="field"
              value={linkEdit.url}
              placeholder="example.com"
              onChange={(event) =>
                setLinkEdit({ ...linkEdit, url: event.target.value })
              }
            />
          </label>
          {linkError ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {linkError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={applyLink}>
              Apply
            </button>
            {linkEdit.existing ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={removeLink}
              >
                Remove link
              </button>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setLinkEdit(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function MarkdownField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="label mt-3 block">
      <label htmlFor={id}>{label}</label>
      <div className="mt-1">
        <FormattingToolbar
          variant="markdown"
          label={label}
          fieldRef={ref}
          onChange={onChange}
        />
      </div>
      <textarea
        id={id}
        ref={ref}
        className="field font-mono"
        rows={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
  codeLanguage,
}: {
  value: Record<string, any>;
  onChange: (v: any) => void;
  path?: string;
  codeLanguage?: string;
}) {
  const language =
    (typeof value.language === "string" && value.language) ||
    codeLanguage ||
    "python";
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
                        codeLanguage={language}
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
                <Fields
                  path={id}
                  value={v}
                  codeLanguage={language}
                  onChange={set}
                />
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
          if (key === "markdown" && value.type === "text")
            return (
              <div key={key}>
                <MarkdownField
                  id={id}
                  label={label}
                  value={v ?? ""}
                  onChange={set}
                />
                <FieldError path={id} />
              </div>
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
              ) : codeEditorKeys.has(key) ? (
                <CodeEditor
                  id={id}
                  language={language}
                  rows={15}
                  value={v ?? ""}
                  onChange={set}
                />
              ) : (
                <textarea
                  id={id}
                  className="field"
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
const codeExerciseOrder = ["instructions", "language", "starterCode"];
function editorFields(block: Block) {
  const entries = Object.entries(withOptionalFields(block)).filter(
    ([key]) =>
      !advancedKeys.has(key) &&
      !(
        key === "markdown" &&
        block.type !== "text" &&
        block.type !== "quick-reference"
      ),
  );
  if (block.type !== "code-exercise") return Object.fromEntries(entries);
  entries.sort((a, b) => {
    const ai = codeExerciseOrder.indexOf(a[0]);
    const bi = codeExerciseOrder.indexOf(b[0]);
    return (
      (ai === -1 ? codeExerciseOrder.length : ai) -
      (bi === -1 ? codeExerciseOrder.length : bi)
    );
  });
  return Object.fromEntries(entries);
}
function blockCodeLanguage(block: Block) {
  return "language" in block ? block.language : undefined;
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
        <LabelWithHint
          label="Suggested questions"
          hintKey="suggestedQuestions"
        />
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
    importMarkdownRef = useRef<HTMLInputElement>(null),
    latest = useRef(initial),
    dirty = useRef(false),
    saving = useRef(false),
    paused = useRef(false),
    reloadAfterSave = useRef(false);
  const [tab, setTab] = useState("rich"),
    [assistantScope, setAssistantScope] = useState<"lesson" | "course">(
      "lesson",
    ),
    [mobile, setMobile] = useState("editor"),
    [status, setStatus] = useState("Saved"),
    [busy, setBusy] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false),
    [assistantOpen, setAssistantOpen] = useState(false),
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
    [showPreview, setShowPreview] = useState(true),
    [pinnedId, setPinnedId] = useState<string | null>(null);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const revealPairRef = useRef<
    (id: string, source: "editor" | "preview") => void
  >(() => {});
  const openPinnedRef = useRef<(id: string | null) => void>(() => {});
  const autoExpandedId = useRef<string | null>(null);
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(
    new Set(),
  );
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
      if (!reloadAfterSave.current) {
        syncLessonAddress(
          lessonPath({ id: courseId, slug: courseSlug }, snapshot),
        );
        const next = { ...latest.current, version: result.version };
        latest.current = next;
        setDraft(next);
        setStatus(
          `${publish ? "Published · " : ""}Saved ${new Date(result.savedAt).toLocaleTimeString()} · ${result.editor}`,
        );
      }
    } catch (e) {
      if (!reloadAfterSave.current) {
        dirty.current = true;
        paused.current = true;
        setStatus(
          "Save failed: " + (e instanceof Error ? e.message : "Please retry"),
        );
      }
    } finally {
      saving.current = false;
      setBusy(false);
      if (reloadAfterSave.current) {
        reloadAfterSave.current = false;
        void loadPlannerDraft();
      }
    }
  }
  async function loadPlannerDraft() {
    if (saving.current) {
      reloadAfterSave.current = true;
      return;
    }
    try {
      const response = await fetch(
        `/api/courses/${courseId}/lessons/${lessonId}/draft`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const result = await response.json();
      if (saving.current) {
        reloadAfterSave.current = true;
        return;
      }
      const next = result.draft as LessonDraft;
      if (!next?.steps) return;
      latest.current = next;
      dirty.current = false;
      paused.current = false;
      setDraft(next);
      setMarkdown(next.sourceMarkdown || serializeLessonMarkdown(next));
      setParseErrors(
        next.sourceMarkdown
          ? parseLessonMarkdown(next.sourceMarkdown, next).errors.map(
              (e) => `Line ${e.line}:${e.column}: ${e.message}`,
            )
          : [],
      );
      setActiveStepId(next.steps[0]?.id);
      setCollapsed(
        new Set(next.steps.flatMap((s) => s.blocks.map((b) => b.id))),
      );
      setPicker(null);
      if (result.lessonAssistant) {
        lessonAssistantRef.current = result.lessonAssistant;
        setLessonAssistant(result.lessonAssistant);
      }
      if (result.courseAssistant) {
        courseAssistantRef.current = result.courseAssistant;
        setCourseAssistant(result.courseAssistant);
      }
      syncLessonAddress(lessonPath({ id: courseId, slug: courseSlug }, next));
      setStatus("Saved");
    } catch {
      /* Keep the open draft if the planner refresh cannot be loaded. */
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
        withBase(`/api/courses/${courseId}/lessons/${lessonId}/history`),
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
  const loadPlannerDraftRef = useRef(loadPlannerDraft);
  loadPlannerDraftRef.current = loadPlannerDraft;
  useEffect(() => {
    function onPlannerChange(event: Event) {
      const detail = (event as CustomEvent<PlannerContentChange>).detail;
      if (
        !detail ||
        (detail.action !== "update_lesson" && detail.action !== "create_lesson")
      )
        return;
      if (String(detail.courseId) !== String(courseId)) return;
      if (!detail.lessonId || String(detail.lessonId) !== String(lessonId))
        return;
      void loadPlannerDraftRef.current();
    }
    window.addEventListener(plannerContentChanged, onPlannerChange);
    return () =>
      window.removeEventListener(plannerContentChanged, onPlannerChange);
  }, [courseId, lessonId]);
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
    const editor = editorPaneRef.current;
    const preview = previewPaneRef.current;
    const wide = window.matchMedia("(min-width: 1024px)");
    if (!editor || !preview || !showPreview) {
      setPinnedId(null);
      return;
    }
    let frame = 0;
    let pending: "editor" | "preview" | null = null;
    let pairedId: string | null = null;
    let userSide: "editor" | "preview" | null = null;
    const ignoreUntil = { editor: 0, preview: 0 };
    const pendingRecheck = { editor: 0, preview: 0 };

    const stopHold = {
      editor: () => {},
      preview: () => {},
    };
    const holdProgrammatic = (side: "editor" | "preview") => {
      stopHold[side]();
      const pane = side === "editor" ? editor : preview;
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        pane.removeEventListener("scroll", extend);
        pane.removeEventListener("scrollend", release);
        stopHold[side] = () => {};
        window.clearTimeout(pendingRecheck[side]);
        ignoreUntil[side] = performance.now() + 80;
      };
      const extend = () => {
        ignoreUntil[side] = performance.now() + 400;
        window.clearTimeout(pendingRecheck[side]);
        pendingRecheck[side] = window.setTimeout(release, 450);
      };
      stopHold[side] = () => {
        settled = true;
        pane.removeEventListener("scroll", extend);
        pane.removeEventListener("scrollend", release);
        window.clearTimeout(pendingRecheck[side]);
      };
      pane.addEventListener("scroll", extend, { passive: true });
      pane.addEventListener("scrollend", release);
      extend();
    };
    const slidePane = (
      pane: HTMLElement,
      side: "editor" | "preview",
      top: number,
    ) => {
      holdProgrammatic(side);
      pane.scrollTo({ top, behavior: "smooth" });
    };

    const topmostId = (pane: HTMLElement) => {
      const paneRect = pane.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const node of pane.querySelectorAll<HTMLElement>(
        "[data-component-id]",
      )) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= paneRect.top + 1 || rect.top >= paneRect.bottom - 1)
          continue;
        const dist = Math.abs(rect.top - paneRect.top);
        if (dist < bestDist) {
          best = node;
          bestDist = dist;
        }
      }
      return best?.dataset.componentId ?? null;
    };

    const follow = (source: "editor" | "preview") => {
      if (!wide.matches) return;
      if (userSide && source !== userSide) return;
      if (performance.now() < ignoreUntil[source]) return;
      const sourcePane = source === "editor" ? editor : preview;
      const targetPane = source === "editor" ? preview : editor;
      const id = topmostId(sourcePane);
      if (!id || id === pairedId) return;
      pairedId = id;
      setPinnedId(id);
      const node = targetPane.querySelector<HTMLElement>(
        `[data-component-id="${CSS.escape(id)}"]`,
      );
      if (!node) return;
      const delta =
        node.getBoundingClientRect().top - targetPane.getBoundingClientRect().top;
      if (Math.abs(delta) <= 2) return;
      const target = source === "editor" ? "preview" : "editor";
      slidePane(targetPane, target, targetPane.scrollTop + delta);
    };

    const schedule = (source: "editor" | "preview") => {
      pending = source;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const side = pending;
        pending = null;
        if (side) follow(side);
      });
    };

    revealPairRef.current = (id, source) => {
      cancelAnimationFrame(frame);
      pending = null;
      pairedId = id;
      setPinnedId(id);
      if (!wide.matches) return;
      const targetSide = source === "editor" ? "preview" : "editor";
      const targetPane = targetSide === "editor" ? editor : preview;
      const node = targetPane.querySelector<HTMLElement>(
        `[data-component-id="${CSS.escape(id)}"]`,
      );
      if (!node) return;
      const delta =
        node.getBoundingClientRect().top - targetPane.getBoundingClientRect().top;
      if (Math.abs(delta) <= 2) return;
      slidePane(targetPane, targetSide, targetPane.scrollTop + delta);
    };

    const onEditor = () => {
      if (performance.now() < ignoreUntil.editor) return;
      userSide = "editor";
      schedule("editor");
    };
    const onPreview = () => {
      if (performance.now() < ignoreUntil.preview) return;
      userSide = "preview";
      schedule("preview");
    };
    const onWide = () => {
      if (!wide.matches) setPinnedId(null);
    };
    editor.addEventListener("scroll", onEditor, { passive: true });
    preview.addEventListener("scroll", onPreview, { passive: true });
    wide.addEventListener("change", onWide);
    const initialId = wide.matches ? topmostId(editor) : null;
    pairedId = initialId;
    setPinnedId(initialId);
    return () => {
      revealPairRef.current = () => {};
      stopHold.editor();
      stopHold.preview();
      editor.removeEventListener("scroll", onEditor);
      preview.removeEventListener("scroll", onPreview);
      wide.removeEventListener("change", onWide);
      cancelAnimationFrame(frame);
      window.clearTimeout(pendingRecheck.editor);
      window.clearTimeout(pendingRecheck.preview);
    };
  }, [showPreview, activeStepId, draft, tab]);
  openPinnedRef.current = (id) => {
    if (!id) return;
    const prior = autoExpandedId.current;
    autoExpandedId.current = id;
    setExpandedPreviews((previous) => {
      if (prior === id && previous.has(id)) return previous;
      const next = new Set(previous);
      if (prior && prior !== id) next.delete(prior);
      next.add(id);
      return next;
    });
  };
  function togglePreview(id: string) {
    if (expandedPreviews.has(id) && autoExpandedId.current === id)
      autoExpandedId.current = null;
    setExpandedPreviews((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectPair(id: string, source: "editor" | "preview", expand = true) {
    flushSync(() => {
      setPinnedId(id);
      if (expand) openPinnedRef.current(id);
    });
    revealPairRef.current(id, source);
  }
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
    else setDetailsOpen(true);
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
      <main
        className={`p-4 ${showPreview ? "lg:flex lg:h-dvh lg:max-h-dvh lg:flex-col lg:overflow-hidden" : ""}`}
        aria-busy={!ready}
      >
        <fieldset
          disabled={!ready || restoring}
          className={`min-w-0 ${showPreview ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden" : ""}`}
          aria-label="Lesson editor"
        >
          <header
            className={`mx-auto mb-5 w-full shrink-0 text-left ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
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
                            window.location.href = withBase(
                              coursePath({
                                id: courseId,
                                slug: courseSlug,
                              }),
                            );
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
              endpoint={withBase(
                `/api/courses/${courseId}/lessons/${lessonId}/history`,
              )}
              busy={busy}
              onRestore={restore}
            />
          </header>
          <nav
            className={`relative z-40 mx-auto mb-5 flex w-full shrink-0 flex-wrap items-end gap-x-4 gap-y-2 ${showPreview ? "max-w-7xl" : "max-w-4xl"}`}
            aria-label="Editor mode"
          >
            <div
              className="flex border-b border-zinc-200"
              role="tablist"
              aria-label="Editing view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "rich"}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "rich" ? "border-teal-700 text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
                onClick={() => setTab("rich")}
              >
                Rich Editor
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "markdown"}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === "markdown" ? "border-teal-700 text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
                onClick={() => {
                  setTab("markdown");
                  if (!parseErrors.length)
                    setMarkdown(serializeLessonMarkdown(latest.current));
                }}
              >
                Markdown
              </button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailsOpen(true)}
              >
                Lesson details
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAssistantOpen(true)}
              >
                Learning Assistant
              </button>
              <button
                type="button"
                className={`hidden lg:inline-flex ${showPreview ? "btn-primary" : "btn-secondary"}`}
                aria-pressed={showPreview}
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? "Hide preview" : "Show preview"}
              </button>
              <ActionMenu label="More" text="More" className="z-40">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => importMarkdownRef.current?.click()}
                  >
                    Import Markdown
                  </button>
                  <button
                    type="button"
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
                    Export Markdown
                  </button>
              </ActionMenu>
            </div>
            <input
              ref={importMarkdownRef}
              className="sr-only"
              type="file"
              aria-label="Import Markdown"
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
          </nav>
          {!!errors.length && (
            <section
              role="alert"
              className="mx-auto my-3 max-w-7xl shrink-0 rounded border border-red-300 bg-red-50 p-3"
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
          <>
            <div className="my-2 flex shrink-0 gap-2 lg:hidden">
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
              className={`mx-auto grid gap-6 ${showPreview ? "max-w-7xl lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden" : "max-w-4xl"}`}
            >
              <section
                ref={editorPaneRef}
                className={`min-w-0 ${mobile === "preview" ? "hidden lg:block" : ""} ${showPreview ? "lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain" : ""}`}
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
                                  data-component-id={b.id}
                                  tabIndex={-1}
                                  className="[outline:none]"
                                  onClick={(event) => {
                                    const target = event.target;
                                    const keepClosed =
                                      target instanceof Element &&
                                      !!target.closest(
                                        "[data-card-toggle], [data-preview-toggle], details",
                                      );
                                    selectPair(b.id, "editor", !keepClosed);
                                  }}
                                  onFocusCapture={() =>
                                    selectPair(b.id, "editor", false)
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
                                    previewExpanded={expandedPreviews.has(b.id)}
                                    onPreviewToggle={() => togglePreview(b.id)}
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
                                      value={editorFields(b)}
                                      codeLanguage={blockCodeLanguage(b)}
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
                                    {b.type !== "text" && (
                                      <details className="mt-4 border-t border-zinc-100 pt-3">
                                        <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">
                                          Additional settings
                                        </summary>
                                        <Fields
                                          codeLanguage={blockCodeLanguage(b)}
                                          value={{
                                            type: b.type,
                                            ...Object.fromEntries(
                                              Object.entries(
                                                withOptionalFields(b),
                                              ).filter(
                                                ([key, value]) =>
                                                  advancedKeys.has(key) ||
                                                  (key === "markdown" &&
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
                                        {"markdown" in b && b.markdown && (
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
                                    )}
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
                  </>
                )}
              </section>
              <aside
                ref={previewPaneRef}
                tabIndex={0}
                aria-label="Learner preview"
                className={`min-w-0 lg:pr-2 ${mobile === "editor" ? "hidden" : ""} ${showPreview ? "lg:block lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain" : "lg:hidden"}`}
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
                            className={`w-full rounded-xl border border-zinc-200 p-4 shadow-sm [outline:none] ${showPreview && pinnedId === b.id ? "bg-[#e4ecf7]" : "bg-white"}`}
                            data-component-id={b.id}
                            key={b.id}
                            onClick={() => selectPair(b.id, "preview")}
                            onFocusCapture={() =>
                              selectPair(b.id, "preview", false)
                            }
                          >
                            <BlockRenderer block={b} embedded />
                          </div>
                        ))}
                    </div>
                  </section>
                ))}
              </aside>
            </div>
          </>
          <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(95vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-6">
                <Dialog.Title className="text-xl font-bold">
                  Lesson details
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-zinc-600">
                  Title, address, and who the lesson is for.
                </Dialog.Description>
                <div className="mt-4">
                  <Fields value={draft} path="metadata" onChange={change} />
                </div>
                <Dialog.Close className="btn-secondary mt-4">
                  Close
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Dialog.Root open={assistantOpen} onOpenChange={setAssistantOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(95vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-6">
                <Dialog.Title className="text-xl font-bold">
                  Learning Assistant
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Suggested questions and constraints for this lesson or the
                  whole course.
                </Dialog.Description>
                <div
                  role="tablist"
                  aria-label="Learning Assistant"
                  className="my-4 flex flex-wrap gap-2"
                >
                  <button
                    id="assistant-lesson"
                    type="button"
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
                    type="button"
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
                <Dialog.Close className="btn-secondary mt-4">
                  Close
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
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
