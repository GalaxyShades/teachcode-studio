"use client";
import { useState, useRef, useEffect } from "react";
import { execute } from "@/lib/runtime";
export function CodeRunner({
  language,
  starter,
  execution = "browser",
  expectedOutput,
  check,
}: {
  language: "python" | "r";
  starter: string;
  execution?: "browser" | "server";
  expectedOutput?: string;
  check?: string;
}) {
  const [code, setCode] = useState(starter),
    [out, setOut] = useState(""),
    [figures, setFigures] = useState<string[]>([]),
    [figureIndex, setFigureIndex] = useState(0),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    cancel = useRef<(() => void) | undefined>(undefined),
    seenStarter = useRef(starter);
  useEffect(() => {
    if (seenStarter.current === starter) return;
    seenStarter.current = starter;
    setCode(starter);
  }, [starter]);
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => {
    setFigureIndex((index) =>
      figures.length === 0 ? 0 : Math.min(index, figures.length - 1),
    );
  }, [figures]);
  async function run() {
    setBusy(true);
    setOut("");
    setFigures([]);
    try {
      const task = execute(language, code, setStatus, check);
      cancel.current = task.cancel;
      const result = await task.promise;
      setOut(result.output);
      setFigures(result.figures);
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
      cancel.current = undefined;
    }
  }
  const figure = figures[figureIndex];
  return (
    <section className="rounded-lg border bg-zinc-950 p-3 text-zinc-100">
      <textarea
        aria-label={`${language} code`}
        className="w-full bg-transparent font-mono text-sm"
        rows={15}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {execution === "server" ? (
        <p>
          Server execution is unsupported. Select browser execution; a dedicated
          sandbox service is required for server execution.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={run}>
            {busy ? status || "Starting…" : "Run code"}
          </button>
          {busy && (
            <button
              className="btn-secondary text-zinc-900"
              onClick={() => cancel.current?.()}
            >
              Cancel
            </button>
          )}
          <button
            className="btn-secondary text-zinc-900"
            disabled={busy}
            onClick={() => {
              setCode(starter);
              setOut("");
              setFigures([]);
            }}
          >
            Reset code
          </button>
        </div>
      )}
      <pre
        role="status"
        className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm"
      >
        {out}
      </pre>
      {figure ? (
        <div className="mt-3">
          <img
            alt={`Plot ${figureIndex + 1} of ${figures.length}`}
            className="max-h-80 w-full rounded bg-white object-contain"
            src={`data:image/png;base64,${figure}`}
          />
          {figures.length > 1 ? (
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn-secondary text-zinc-900"
                aria-label="Previous plot"
                disabled={figureIndex === 0}
                onClick={() => setFigureIndex((index) => index - 1)}
              >
                ←
              </button>
              <span className="text-sm">
                {figureIndex + 1} / {figures.length}
              </span>
              <button
                type="button"
                className="btn-secondary text-zinc-900"
                aria-label="Next plot"
                disabled={figureIndex === figures.length - 1}
                onClick={() => setFigureIndex((index) => index + 1)}
              >
                →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {expectedOutput && (
        <details>
          <summary>Expected output</summary>
          <pre className="whitespace-pre-wrap">{expectedOutput}</pre>
        </details>
      )}
    </section>
  );
}
