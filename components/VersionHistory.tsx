"use client";
import { useState, useId } from "react";
type Version = {
  id: string;
  revision_number: number;
  created_at: string;
  title: string;
  editor: string;
};
export function VersionHistory({
  endpoint,
  status,
  busy,
  onRestore,
}: {
  endpoint: string;
  status: string;
  busy: boolean;
  onRestore: (id: string) => Promise<void>;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [history, setHistory] = useState<{
    versions: Version[];
    publishedId: string | null;
  } | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    setHistory(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load version history");
      setHistory(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load version history",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 break-words text-sm text-zinc-600"
        >
          {status}
        </p>
        <button
          type="button"
          className="btn gap-1.5 px-1 text-zinc-600 hover:bg-zinc-100 hover:text-teal-900"
          disabled={busy || loading}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
            if (!open) void load();
          }}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Version history
        </button>
      </div>
      {open && (
        <section
          id={panelId}
          aria-label="Version history"
          className="card mt-3 p-4"
        >
          <h2 className="font-semibold">Published versions</h2>
          <p className="mt-1 text-sm text-zinc-600">
            The five most recent publications are kept. Restore replaces your
            current draft, including unpublished edits. Publish when you are
            ready to make the restored content public.
          </p>
          {loading && (
            <p role="status" className="mt-3">
              Loading versions…
            </p>
          )}
          {error && (
            <div className="mt-3">
              <p role="alert">{error}</p>
              <button
                className="btn-secondary mt-2"
                disabled={busy || loading}
                onClick={() => void load()}
              >
                Retry
              </button>
            </div>
          )}
          {history?.versions.length === 0 && (
            <p className="mt-3 text-sm">
              No published versions yet. Publish this chapter to create its
              first snapshot.
            </p>
          )}
          <ol className="mt-3 space-y-3">
            {history?.versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">
                    Version {v.revision_number} · {v.title}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {new Date(v.created_at).toLocaleString()} · {v.editor}
                    {history.publishedId === v.id
                      ? " · Current publication"
                      : ""}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  disabled={busy || loading}
                  aria-label={`Restore version ${v.revision_number} to draft`}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Restore version ${v.revision_number} to draft? This replaces your current draft and any unpublished edits. Readers will keep seeing the current publication until you publish again.`,
                      )
                    )
                      return;
                    setError("");
                    try {
                      await onRestore(v.id);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Restore failed. Please retry.",
                      );
                    }
                  }}
                >
                  Restore to draft
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
