/* Browser-only demo execution. This worker is not a security sandbox. */
let python, webR;
self.onmessage = async ({ data }) => {
  const { id, language, code, check } = data;
  let output = "";
  const limit = 32768;
  function append(text) {
    output = (output + text).slice(0, limit);
  }
  try {
    self.postMessage({ id, status: "Loading runtime…" });
    if (language === "python") {
      if (!python) {
        importScripts(
          "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js",
        );
        python = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
        });
      }
      python.setStdout({ batched: (text) => append(text + "\n") });
      python.setStderr({ batched: (text) => append(text + "\n") });
      python.setStdin({ error: true });
      self.postMessage({ id, status: "Running…" });
      const globals = python.runPython("dict()");
      try {
        const result = await python.runPythonAsync(code, { globals });
        result?.destroy?.();
        if (check) {
          await python.runPythonAsync(check, { globals });
          append("\nAuthor checks passed.");
        }
      } finally {
        globals.destroy();
      }
    } else {
      if (!webR) {
        const { WebR } =
          await import("https://webr.r-wasm.org/v0.4.2/webr.mjs");
        webR = new WebR({ channelType: 3 });
        await webR.init();
      }
      self.postMessage({ id, status: "Running…" });
      const shelter = await new webR.Shelter();
      try {
        const env = await shelter.evalR("new.env(parent=globalenv())");
        const result = await shelter.captureR(
          code + (check ? "\n" + check : ""),
          {
            env,
            withAutoprint: true,
            captureStreams: true,
            captureConditions: true,
          },
        );
        let failed = false;
        for (const item of result.output) {
          if (item.type === "stdout" || item.type === "stderr")
            append(item.data + "\n");
          else if (["error", "warning", "message"].includes(item.type)) {
            if (item.type === "error") failed = true;
            const message = await (await item.data.get("message")).toString();
            append(item.type + ": " + message + "\n");
          }
        }
        if (failed) throw new Error("R evaluation failed");
        if (check) append("\nAuthor checks passed.");
      } finally {
        await shelter.purge();
      }
    }
    self.postMessage({
      id,
      done: true,
      output: output || "Completed with no output.",
    });
  } catch (e) {
    self.postMessage({
      id,
      done: true,
      output,
      error: String(e?.message || e).slice(0, limit),
    });
  }
};
