type Message = {
  id: string;
  status?: string;
  done?: boolean;
  output?: string;
  error?: string;
  figures?: string[];
};
export type RunResult = { output: string; figures: string[] };
const workers = new Map<string, { worker: Worker; busy: boolean }>();
export function execute(
  language: "python" | "r",
  code: string,
  onStatus: (s: string) => void,
  check?: string,
) {
  let entry = workers.get(language);
  if (entry?.busy)
    throw new Error("Another exercise is running. Wait or cancel it first.");
  if (!entry) {
    entry = { worker: new Worker("/runtime-worker.js"), busy: false };
    workers.set(language, entry);
  }
  entry.busy = true;
  const active = entry,
    id = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout>, finish: (reason: string) => void;
  const promise = new Promise<RunResult>((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      active.busy = false;
      active.worker.onmessage = null;
      active.worker.onerror = null;
    }
    finish = (reason) => {
      cleanup();
      active.worker.terminate();
      workers.delete(language);
      reject(new Error(reason));
    };
    timer = setTimeout(
      () =>
        finish("Runtime loading timed out. Check your connection and retry."),
      180000,
    );
    active.worker.onerror = () =>
      finish("Runtime unavailable. Check your connection and retry.");
    active.worker.onmessage = ({ data }: { data: Message }) => {
      if (data.id !== id) return;
      if (data.status) {
        onStatus(data.status);
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            finish(
              data.status === "Running…"
                ? "Execution stopped after 10 seconds."
                : "Runtime loading timed out. Check your connection and retry.",
            ),
          data.status === "Running…" ? 10000 : 180000,
        );
      }
      if (data.done) {
        cleanup();
        const figures = Array.isArray(data.figures)
          ? data.figures.filter((item) => typeof item === "string")
          : [];
        if (data.error)
          reject(new Error((data.output ?? "") + "\n" + data.error));
        else resolve({ output: data.output ?? "", figures });
      }
    };
    active.worker.postMessage({ id, language, code, check });
  });
  return { promise, cancel: () => finish("Execution cancelled.") };
}
