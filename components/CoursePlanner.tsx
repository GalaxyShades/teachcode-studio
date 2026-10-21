"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownLinkHref } from "@/lib/link-href";
import { withBase } from "@/lib/paths";
import {
  plannerContentChanged,
  type PlannerContentChange,
} from "@/lib/planner/events";
import { readMessageAttachments } from "@/lib/planner/message-text";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
type Attachment = { id: string; filename: string };
type PlannerModel = { id: string; name: string };

const plannerModelLabels: Record<string, string> = {
  "qwen/qwen3.7-max": "Qwen",
  "x-ai/grok-4.7": "Grok",
  "anthropic/claude-sonnet-5.5": "Claude",
  "openai/gpt-5.5": "GPT-5.5",
};

function plannerModelLabel(model: PlannerModel) {
  return plannerModelLabels[model.id] || model.name || model.id;
}

const plannerControl =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium leading-none transition";
const plannerSecondary = `${plannerControl} border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50`;
const plannerPrimary = `${plannerControl} border-transparent bg-teal-700 text-white hover:bg-teal-800`;
const plannerHeaderButton =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium leading-none text-zinc-700 hover:bg-zinc-100";

function PlannerIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Turn a bare lesson path into a Markdown link without touching links already written. */
function linkLessonPaths(text: string) {
  return text
    .split(/(\[[^\]]*\]\([^)\s]+\))/g)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(
        /(^|[\s])(\/courses\/[^\s)]+)/g,
        (_match, lead: string, path: string) => {
          const clean = path.replace(/[.,;:]+$/, "");
          return `${lead}[${clean}](${clean})${path.slice(clean.length)}`;
        },
      );
    })
    .join("");
}

const plannerGreeting =
  "Hello! You can ask for a lesson, a chapter, or a change to the course on this page.";

function presentMessages(rows: ChatMessage[]) {
  return rows.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      content: readMessageAttachments(message.content).content,
    };
  });
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm leading-relaxed [&_:not(pre)>code]:bg-white [&_h1]:my-1 [&_h1]:text-base [&_h2]:my-1 [&_h2]:text-base [&_h3]:my-1 [&_h3]:text-sm [&_ol]:my-1 [&_p]:my-1 [&_pre]:my-2 [&_pre]:p-2 [&_ul]:my-1">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={markdownLinkHref}
      >
        {linkLessonPaths(text)}
      </ReactMarkdown>
    </div>
  );
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || "The course planner could not finish.";
}

export function CoursePlanner() {
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const removingAttachment = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelId, setModelId] = useState("");
  const [models, setModels] = useState<PlannerModel[]>([]);
  const [modelSaving, setModelSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(withBase("/api/planner/thread"))
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = await response.json();
        if (cancelled) return;
        setMessages(presentMessages(body.messages ?? []));
        setAttachments(body.attachments ?? []);
      })
      .catch(() => {});
    fetch(withBase("/api/authoring/openrouter"))
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = await response.json();
        if (cancelled) return;
        setModelId(typeof body.model === "string" ? body.model : "");
        setModels(Array.isArray(body.models) ? body.models : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, status, error, open, expanded]);

  useEffect(() => {
    if (!open && !expanded) return;
    composer.current?.setAttribute("writingsuggestions", "false");
    composer.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, expanded]);

  async function changeModel(next: string) {
    if (!next || next === modelId || modelSaving) return;
    const previous = modelId;
    setModelId(next);
    setModelSaving(true);
    setError("");
    try {
      const response = await fetch(withBase("/api/authoring/openrouter"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setModelId(previous);
        setError(body?.error || "Could not save the model");
        return;
      }
      setModelId(typeof body?.model === "string" ? body.model : next);
      if (Array.isArray(body?.models)) setModels(body.models);
    } catch {
      setModelId(previous);
      setError("Could not save the model");
    } finally {
      setModelSaving(false);
    }
  }

  async function reloadThread() {
    const response = await fetch(withBase("/api/planner/thread"));
    if (!response.ok) return;
    const body = await response.json();
    setMessages(presentMessages(body.messages ?? []));
    setAttachments(body.attachments ?? []);
  }

  async function clearChat() {
    setError("");
    setWarning("");
    const response = await fetch(withBase("/api/planner/thread"), { method: "DELETE" });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setMessages([]);
    setAttachments([]);
    setStatus("");
  }

  async function removeAttachment(id: string) {
    if (removingAttachment.current.has(id)) return;
    removingAttachment.current.add(id);
    setAttachments((current) => current.filter((file) => file.id !== id));
    try {
      const response = await fetch(
        withBase(`/api/planner/attachments?id=${encodeURIComponent(id)}`),
        { method: "DELETE" },
      );
      if (response.ok || response.status === 404) {
        setError("");
        return;
      }
      setError(await readError(response));
      await reloadThread();
    } catch {
      setError("The course planner could not finish.");
      await reloadThread();
    } finally {
      removingAttachment.current.delete(id);
    }
  }

  async function attachFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    setWarning("");
    setBusy(true);
    let notice = "";
    try {
      for (const file of list) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(withBase("/api/planner/attachments"), {
          method: "POST",
          body: form,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setError(payload?.error || "The course planner could not finish.");
          break;
        }
        if (typeof payload?.warning === "string" && payload.warning.trim())
          notice = payload.warning;
      }
      if (notice) setWarning(notice);
      await reloadThread();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const tempId = `local-${Date.now()}`;
    setDraft("");
    setError("");
    setWarning("");
    setStatus("");
    setBusy(true);
    setMessages((current) => [
      ...current,
      {
        id: tempId,
        role: "user",
        content: text,
      },
    ]);
    try {
      const response = await fetch(withBase("/api/planner/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, path: pathname }),
      });
      if (!response.ok || !response.body) {
        setMessages((current) =>
          current.filter((message) => message.id !== tempId),
        );
        setDraft(text);
        setError(await readError(response));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let refreshed = false;
      const publishChange = (change: PlannerContentChange) => {
        window.dispatchEvent(
          new CustomEvent(plannerContentChanged, { detail: change }),
        );
        if (refreshed) return;
        refreshed = true;
        router.refresh();
      };
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type?: string;
            text?: string;
            error?: string;
            change?: PlannerContentChange;
          };
          if (event.type === "status") setStatus(event.text ?? "");
          if (event.type === "error")
            setError(event.error ?? "Something went wrong.");
          if (
            event.type === "changed" &&
            event.change?.courseId &&
            event.change.action
          )
            publishChange(event.change);
          if (event.type === "reply" && event.text)
            setMessages((current) => [
              ...current,
              {
                id: `reply-${Date.now()}`,
                role: "assistant",
                content: event.text!,
              },
            ]);
        }
      }
      setStatus("");
      await reloadThread();
    } catch {
      setError("The course planner could not finish.");
    } finally {
      setBusy(false);
    }
  }

  const listedModels = models.filter((model) => !/glm/i.test(model.id));
  const modelChoices =
    modelId &&
    !/glm/i.test(modelId) &&
    !listedModels.some((model) => model.id === modelId)
      ? [{ id: modelId, name: modelId }, ...listedModels]
      : listedModels;

  const modelField = (placement: "inline" | "below") => (
    <label
      className={
        placement === "inline"
          ? "ml-auto flex min-w-0 max-w-xs shrink items-center gap-2 text-xs font-medium text-zinc-600"
          : "mt-2 flex items-center gap-2 text-xs font-medium text-zinc-600"
      }
      htmlFor={`${titleId}-model`}
    >
      <span className="shrink-0">Model</span>
      <select
        id={`${titleId}-model`}
        aria-label="Model for the next message"
        className={
          placement === "inline"
            ? "h-8 w-40 min-w-0 max-w-full shrink rounded-lg border border-zinc-200 bg-white px-2 text-sm font-normal text-zinc-900"
            : "h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-normal text-zinc-900"
        }
        value={
          modelChoices.some((model) => model.id === modelId) ? modelId : ""
        }
        disabled={!modelChoices.length || modelSaving}
        onChange={(event) => void changeModel(event.target.value)}
      >
        {!modelChoices.length && <option value="">Loading models…</option>}
        {modelChoices.map((model) => (
          <option key={model.id} value={model.id} title={model.id}>
            {plannerModelLabel(model)}
          </option>
        ))}
      </select>
    </label>
  );

  const shell = (mode: "panel" | "dialog") => (
    <div
      role="dialog"
      aria-modal={mode === "dialog"}
      aria-labelledby={titleId}
      className={
        mode === "panel"
          ? "card fixed bottom-20 right-4 z-40 flex h-[min(560px,calc(100vh-6rem))] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden"
          : "card flex h-[min(860px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden"
      }
    >
      <header className="border-b px-3 py-2.5">
        <div className="flex flex-nowrap items-center gap-2">
          <h2 id={titleId} className="shrink-0 text-sm font-semibold">
            Course planner
          </h2>
          {mode === "dialog" ? modelField("inline") : null}
          <div
            className={
              mode === "dialog"
                ? "flex shrink-0 items-center gap-1"
                : "ml-auto flex shrink-0 items-center gap-1"
            }
          >
            <button
              type="button"
              className={plannerHeaderButton}
              onClick={clearChat}
            >
              <PlannerIcon>
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M6 6l1 14h10l1-14" />
              </PlannerIcon>
              Clear
            </button>
            {mode === "panel" ? (
              <button
                type="button"
                className={plannerHeaderButton}
                onClick={() => setExpanded(true)}
              >
                <PlannerIcon>
                  <path d="M15 3h6v6" />
                  <path d="M9 21H3v-6" />
                  <path d="M21 3l-7 7" />
                  <path d="M3 21l7-7" />
                </PlannerIcon>
                Expand
              </button>
            ) : (
              <button
                type="button"
                className={plannerHeaderButton}
                onClick={() => setExpanded(false)}
              >
                <PlannerIcon>
                  <path d="M4 14h6v6" />
                  <path d="M20 10h-6V4" />
                  <path d="M14 10l7-7" />
                  <path d="M10 14l-7 7" />
                </PlannerIcon>
                Shrink
              </button>
            )}
            <button
              type="button"
              className={plannerHeaderButton}
              onClick={() => {
                setExpanded(false);
                setOpen(false);
              }}
            >
              <PlannerIcon>
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </PlannerIcon>
              Close
            </button>
          </div>
        </div>
        {mode === "panel" ? modelField("below") : null}
      </header>
      <div
        ref={scroller}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        <div className="mr-8 rounded-lg bg-zinc-100 px-3 py-2">
          <p className="text-sm leading-relaxed">{plannerGreeting}</p>
        </div>
        {messages.map((message) => {
          const userText =
            message.role === "user"
              ? readMessageAttachments(message.content).content
              : null;
          return (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-8 rounded-lg bg-teal-700 px-3 py-2 text-white"
                  : "mr-8 rounded-lg bg-zinc-100 px-3 py-2"
              }
            >
              {userText !== null ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {userText}
                </p>
              ) : (
                <AssistantMarkdown text={message.content} />
              )}
            </div>
          );
        })}
        {status && (
          <p className="text-sm text-zinc-500" aria-live="polite">
            {status}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {attachments.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-900"
              >
                <span className="truncate">{file.filename}</span>
                <button
                  type="button"
                  className="rounded px-1 font-semibold"
                  aria-label={`Remove ${file.filename}`}
                  onClick={() => void removeAttachment(file.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {warning && (
          <p
            className="mb-2 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm leading-snug text-zinc-900"
            role="status"
          >
            {warning}
          </p>
        )}
        <textarea
          ref={composer}
          className="field mt-0 min-h-16 resize-none"
          placeholder="Describe the lesson or the change"
          value={draft}
          disabled={busy}
          autoComplete="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className={plannerSecondary}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <PlannerIcon>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </PlannerIcon>
            Attach
          </button>
          <button
            type="submit"
            className={plannerPrimary}
            disabled={busy || !draft.trim()}
          >
            <PlannerIcon>
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </PlannerIcon>
            Send
          </button>
        </div>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          multiple
          accept=".md,.txt,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf"
          aria-label="Attach a file"
          onChange={(event) => void attachFiles(event.target.files)}
        />
      </form>
    </div>
  );

  return (
    <>
      {!expanded && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg hover:bg-teal-800"
          aria-label={open ? "Close course planner" : "Open course planner"}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z" />
          </svg>
        </button>
      )}
      {open && !expanded && shell("panel")}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          {shell("dialog")}
        </div>
      )}
    </>
  );
}
