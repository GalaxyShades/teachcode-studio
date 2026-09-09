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
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    cancel = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancel.current?.(), []);
  async function run() {
    setBusy(true);
    setOut("");
    try {
      const task = execute(language, code, setStatus, check);
      cancel.current = task.cancel;
      setOut(await task.promise);
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
      cancel.current = undefined;
    }
  }
  return (
    <section className="rounded-lg border bg-zinc-950 p-3 text-zinc-100">
      <textarea
        aria-label={`${language} code`}
        className="w-full bg-transparent font-mono text-sm"
        rows={8}
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
      {expectedOutput && (
        <details>
          <summary>Expected output</summary>
          <pre className="whitespace-pre-wrap">{expectedOutput}</pre>
        </details>
      )}
    </section>
  );
}
