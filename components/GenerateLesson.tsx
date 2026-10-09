"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthoringGuide } from "./AuthoringGuide";

type Model = { id: string; name: string };
type View = {
  hasKey: boolean;
  model: string | null;
  models: Model[];
  apiKey?: string;
  error?: string;
};

function creationTabClass(selected: boolean) {
  return selected
    ? "btn min-h-11 w-full bg-teal-700 text-white shadow-inner ring-2 ring-inset ring-teal-950 hover:bg-teal-800"
    : "btn-secondary min-h-11 w-full";
}

function isPdf(file: File) {
  const name = file.name.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot !== -1 && name.slice(dot + 1) === "pdf";
}

function assignFiles(input: HTMLInputElement, files: File[]) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c5 0 9.3 3.1 11 7a11.6 11.6 0 0 1-3.2 4.1" />
          <path d="M6.1 6.1C4.2 7.4 2.7 9.1 1 12c1.7 3.9 6 7 11 7 1.6 0 3.1-.3 4.5-.9" />
        </>
      ) : (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function GenerateLesson({
  courseId,
  courseHref,
  courseTitle,
  template,
  prompt,
}: {
  courseId: string;
  courseHref: string;
  courseTitle: string;
  template: string;
  prompt: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef<File[]>([]);
  const selectionTicket = useRef(0);
  const assigning = useRef(false);
  const checkingRef = useRef(false);
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [paste, setPaste] = useState("");
  const [sources, setSources] = useState<File[]>([]);
  const [sourceAlert, setSourceAlert] = useState("");
  const [busy, setBusy] = useState<"save" | "create" | "remove" | "check" | "">(
    "",
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"generate" | "prompt">("generate");
  const [revealKey, setRevealKey] = useState(false);

  function apply(view: View) {
    setHasKey(view.hasKey);
    setModel(view.model ?? "");
    setModels(view.models ?? []);
    setError(view.error ?? "");
    setApiKey(view.apiKey ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/authoring/openrouter");
        const view = await response.json();
        if (!response.ok)
          throw new Error(view.error || "Could not load settings");
        if (!cancelled) apply(view);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load settings");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveKey() {
    setBusy("save");
    setError("");
    try {
      const response = await fetch("/api/authoring/openrouter", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const view = await response.json();
      if (!response.ok) throw new Error(view.error || "Could not save the key");
      apply(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the key");
    } finally {
      setBusy("");
    }
  }

  async function saveModel(next: string) {
    setModel(next);
    if (!next) return;
    setError("");
    try {
      const response = await fetch("/api/authoring/openrouter", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      const view = await response.json();
      if (!response.ok)
        throw new Error(view.error || "Could not save the model");
      apply(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the model");
    }
  }

  async function removeKey() {
    if (!window.confirm("Remove the saved OpenRouter key?")) return;
    setBusy("remove");
    setError("");
    try {
      const response = await fetch("/api/authoring/openrouter", {
        method: "DELETE",
      });
      const view = await response.json();
      if (!response.ok)
        throw new Error(view.error || "Could not remove the key");
      apply(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the key");
    } finally {
      setBusy("");
    }
  }

  function keepSources(files: File[]) {
    sourcesRef.current = files;
    setSources(files);
    const input = fileRef.current;
    if (!input) return;
    assigning.current = true;
    try {
      assignFiles(input, files);
    } catch {
      input.value = "";
    } finally {
      assigning.current = false;
    }
  }

  async function chooseSources(list: FileList | null) {
    if (assigning.current) return;
    const chosen = [...(list ?? [])];
    setError("");
    const ticket = ++selectionTicket.current;
    const pdfs = chosen.filter(isPdf);
    keepSources(chosen.filter((file) => !isPdf(file)));
    if (!pdfs.length) {
      checkingRef.current = false;
      setSourceAlert("");
      setBusy((current) => (current === "check" ? "" : current));
      return;
    }
    checkingRef.current = true;
    setSourceAlert("");
    setBusy("check");
    const checked = await Promise.all(
      chosen.map(async (file) => {
        if (!isPdf(file)) return { file, keep: true, error: "" };
        const form = new FormData();
        form.append("file", file);
        try {
          const response = await fetch(
            `/api/courses/${courseId}/lessons/pdf-text`,
            { method: "POST", body: form },
          );
          const result = (await response.json().catch(() => ({}))) as {
            error?: unknown;
          };
          if (!response.ok)
            return {
              file,
              keep: false,
              error:
                typeof result.error === "string"
                  ? result.error
                  : `${file.name} looks like a scan with no selectable text and cannot be used.`,
            };
          return { file, keep: true, error: "" };
        } catch {
          return { file, keep: false, error: `Could not read ${file.name}.` };
        }
      }),
    );
    if (ticket !== selectionTicket.current) return;
    checkingRef.current = false;
    keepSources(checked.filter((item) => item.keep).map((item) => item.file));
    setSourceAlert(
      checked
        .map((item) => item.error)
        .filter(Boolean)
        .join("\n"),
    );
    setBusy((current) => (current === "check" ? "" : current));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!hasKey || busy || checkingRef.current) return;
    setError("");
    const files = sourcesRef.current;
    if (!files.length && !paste.trim()) {
      setError("Add a source file, additional text, or both.");
      return;
    }
    const form = new FormData();
    form.set("additional", paste);
    for (const file of files) form.append("files", file);
    setBusy("create");
    try {
      const response = await fetch(
        `/api/courses/${courseId}/lessons/generate`,
        {
          method: "POST",
          body: form,
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not create the lesson");
      router.push(courseHref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the lesson");
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href={courseHref} className="text-teal-800 underline">
        ← {courseTitle}
      </Link>
      <header className="mt-5 border-b pb-6">
        <h1 className="break-words text-3xl font-bold">
          Create lesson with AI
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Save an OpenRouter key, choose a model, then add source files and any
          additional text. The new lesson is added to the course outline.
        </p>
      </header>
      <div className="mt-6 w-full">
        <p
          id="lesson-creation-label"
          className="mb-2 text-sm font-medium text-zinc-700"
        >
          How to create the lesson
        </p>
        <nav
          className="grid grid-cols-2 gap-2"
          aria-labelledby="lesson-creation-label"
        >
          <button
            type="button"
            aria-pressed={tab === "generate"}
            className={creationTabClass(tab === "generate")}
            onClick={() => setTab("generate")}
          >
            Generate
          </button>
          <button
            type="button"
            aria-pressed={tab === "prompt"}
            className={creationTabClass(tab === "prompt")}
            onClick={() => setTab("prompt")}
          >
            Copy a prompt
          </button>
        </nav>
        <form
          className="card mt-3 p-5 sm:p-6"
          hidden={tab !== "generate"}
          onSubmit={create}
          aria-label="Create a lesson from source"
          aria-busy={busy === "create"}
        >
          <label className="label block" htmlFor="openrouter-api-key">
            OpenRouter API key
            <span className="relative mt-1 block">
              <input
                id="openrouter-api-key"
                className="field mt-0 pr-10"
                type={revealKey ? "text" : "password"}
                name="openrouter-api-key"
                autoComplete="off"
                value={apiKey}
                disabled={!!busy}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-zinc-500 hover:text-zinc-800"
                aria-label={revealKey ? "Hide API key" : "Show API key"}
                aria-pressed={revealKey}
                disabled={!!busy}
                onClick={() => setRevealKey((current) => !current)}
              >
                <EyeIcon off={revealKey} />
              </button>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!!busy || apiKey.trim().length < 20}
              onClick={() => void saveKey()}
            >
              {busy === "save" ? "Saving key…" : "Save key"}
            </button>
            {hasKey && (
              <button
                type="button"
                className="btn-secondary"
                disabled={!!busy}
                onClick={() => void removeKey()}
              >
                Remove
              </button>
            )}
          </div>
          <label className="label mt-5 block" htmlFor="openrouter-model">
            Model
          </label>
          <select
            id="openrouter-model"
            className="field"
            value={model}
            disabled={!hasKey || !!busy}
            onChange={(event) => void saveModel(event.target.value)}
          >
            <option value="">
              {hasKey ? "Choose a model" : "Save a key first"}
            </option>
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.id})
              </option>
            ))}
          </select>
          <label className="label mt-5 block">
            Source files
            <input
              ref={fileRef}
              className="field"
              type="file"
              multiple
              accept=".md,.txt,.markdown,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              aria-label="Source files"
              aria-describedby={
                sourceAlert ? "source-file-alert" : undefined
              }
              disabled={!!busy}
              onChange={(event) => void chooseSources(event.target.files)}
            />
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            .md, .txt, .markdown, .pdf, or .docx. You can choose more than one.
          </p>
          {sources.length > 0 && (
            <ul aria-label="Selected source files" className="mt-2 text-sm">
              {sources.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`}>{file.name}</li>
              ))}
            </ul>
          )}
          {busy === "check" && (
            <p role="status" className="mt-2 text-sm text-zinc-600">
              Checking PDF text…
            </p>
          )}
          {sourceAlert && (
            <p
              id="source-file-alert"
              role="alert"
              className="mt-2 whitespace-pre-wrap text-sm text-red-700"
            >
              {sourceAlert}
            </p>
          )}
          <label className="label mt-5 block">
            Additional text
            <textarea
              className="field"
              rows={4}
              placeholder="Course content"
              aria-label="Additional text"
              value={paste}
              maxLength={80000}
              disabled={!!busy}
              onChange={(event) => setPaste(event.target.value)}
            />
          </label>
          {busy === "create" && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-800"
            >
              Creating lesson…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 whitespace-pre-wrap text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary mt-5"
            disabled={!hasKey || !!busy}
          >
            {busy === "create" ? "Creating lesson…" : "Create lesson"}
          </button>
        </form>
        <div className="card mt-3 p-5 sm:p-6" hidden={tab !== "prompt"}>
          <AuthoringGuide template={template} prompt={prompt} />
        </div>
      </div>
    </main>
  );
}
