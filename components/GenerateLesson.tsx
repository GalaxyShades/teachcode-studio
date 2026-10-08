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
  error?: string;
};

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
  const [hasKey, setHasKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<"save" | "create" | "remove" | "">("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"generate" | "prompt">("generate");

  function apply(view: View) {
    setHasKey(view.hasKey);
    setModel(view.model ?? "");
    setModels(view.models ?? []);
    setError(view.error ?? "");
    if (view.hasKey) {
      setApiKey("");
      setReplacing(false);
    }
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

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!hasKey || busy) return;
    setError("");
    const file = fileRef.current?.files?.[0];
    let source = paste.trim();
    if (file) {
      const text = (await file.text()).trim();
      source = text && source ? `${text}\n\n${source}` : text || source;
    }
    if (!source) {
      setError("Add a source file or paste some text.");
      return;
    }
    setBusy("create");
    try {
      const response = await fetch(
        `/api/courses/${courseId}/lessons/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
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

  const showKeyField = !hasKey || replacing;
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
          Save an OpenRouter key, choose a model, then add a source file or a
          short excerpt. The new lesson is added to the course outline.
        </p>
      </header>
      <nav
        className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2"
        aria-label="Lesson creation"
      >
        <button
          type="button"
          aria-pressed={tab === "generate"}
          className={tab === "generate" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("generate")}
        >
          Generate
        </button>
        <button
          type="button"
          aria-pressed={tab === "prompt"}
          className={tab === "prompt" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("prompt")}
        >
          Copy a prompt
        </button>
      </nav>
      <form
        className="card mt-6 max-w-3xl p-5 sm:p-6"
        hidden={tab !== "generate"}
        onSubmit={create}
        aria-label="Create a lesson from source"
        aria-busy={busy === "create"}
      >
        {showKeyField ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="label min-w-0 flex-1 basis-64">
              OpenRouter API key
              <input
                className="field"
                type="password"
                name="openrouter-api-key"
                autoComplete="off"
                value={apiKey}
                disabled={!!busy}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={!!busy || apiKey.trim().length < 20}
              onClick={() => void saveKey()}
            >
              Save key
            </button>
            {replacing && (
              <button
                type="button"
                className="btn-secondary"
                disabled={!!busy}
                onClick={() => {
                  setReplacing(false);
                  setApiKey("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-teal-800">Key saved</p>
            <button
              type="button"
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => setReplacing(true)}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => void removeKey()}
            >
              Remove
            </button>
          </div>
        )}
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
          Source file
          <input
            ref={fileRef}
            className="field"
            type="file"
            accept=".md,.txt,.markdown,text/markdown,text/plain"
            aria-label="Source file"
            disabled={!!busy}
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">.md, .txt, or .markdown</p>
        <label className="label mt-5 block">
          Or paste
          <textarea
            className="field"
            rows={4}
            placeholder="Short excerpt"
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
      <div className="card mt-6 p-5 sm:p-6" hidden={tab !== "prompt"}>
        <AuthoringGuide template={template} prompt={prompt} />
      </div>
    </main>
  );
}
