/* Browser-only demo execution. This worker is not a security sandbox. */
let python, webR;
const builtinPackages = [
  "numpy",
  "matplotlib",
  "scikit-learn",
  "pandas",
  "scipy",
  "statsmodels",
  "micropip",
];
const loadedPackages = new Set();
const packageFailures = new Map();
let scienceReady = false;
const packageImports = [
  ["numpy", /\b(?:import\s+numpy|from\s+numpy)\b/],
  ["matplotlib", /\b(?:import\s+matplotlib|from\s+matplotlib)\b/],
  ["scikit-learn", /\b(?:import\s+sklearn|from\s+sklearn)\b/],
  ["pandas", /\b(?:import\s+pandas|from\s+pandas)\b/],
  ["scipy", /\b(?:import\s+scipy|from\s+scipy)\b/],
  ["statsmodels", /\b(?:import\s+statsmodels|from\s+statsmodels)\b/],
  ["seaborn", /\b(?:import\s+seaborn|from\s+seaborn)\b/],
];

async function ensureSciencePackages(id) {
  if (scienceReady) return;
  self.postMessage({ id, status: "Loading Python packages…" });
  for (const name of builtinPackages) {
    if (loadedPackages.has(name) || packageFailures.has(name)) continue;
    try {
      await python.loadPackage(name);
      loadedPackages.add(name);
    } catch (error) {
      packageFailures.set(name, String(error?.message || error).slice(0, 300));
    }
  }
  if (!loadedPackages.has("seaborn") && !packageFailures.has("seaborn")) {
    try {
      if (!loadedPackages.has("micropip"))
        throw new Error("micropip is unavailable");
      await python.runPythonAsync(
        "import micropip\nawait micropip.install('seaborn')\n",
      );
      loadedPackages.add("seaborn");
    } catch (error) {
      packageFailures.set(
        "seaborn",
        String(error?.message || error).slice(0, 300),
      );
    }
  }
  scienceReady = true;
  if (loadedPackages.has("matplotlib")) {
    try {
      await python.runPythonAsync(`
import matplotlib
matplotlib.use("Agg")
import io
import matplotlib.pyplot as plt
plt.figure()
plt.plot([0, 1])
plt.savefig(io.BytesIO(), format="png")
plt.close("all")
${loadedPackages.has("seaborn") ? "import seaborn" : ""}
`);
    } catch {
      // The font cache can fail without blocking plain Python.
    }
  }
}

function missingPackageMessage(code) {
  const missing = packageImports.filter(
    ([name, pattern]) => packageFailures.has(name) && pattern.test(code),
  );
  if (!missing.length) return "";
  return missing
    .map(([name]) => `${name} failed to load (${packageFailures.get(name)})`)
    .join("\n");
}

async function collectFigures() {
  if (!loadedPackages.has("matplotlib")) return [];
  const result = await python.runPythonAsync(`
import io, json, base64
import matplotlib.pyplot as plt
_figs = []
for _n in plt.get_fignums():
    _buf = io.BytesIO()
    plt.figure(_n).savefig(_buf, format="png", bbox_inches="tight")
    _figs.append(base64.b64encode(_buf.getvalue()).decode("ascii"))
plt.close("all")
json.dumps(_figs)
`);
  const raw = typeof result === "string" ? result : String(result ?? "[]");
  result?.destroy?.();
  const figures = JSON.parse(raw);
  return Array.isArray(figures)
    ? figures.filter((item) => typeof item === "string")
    : [];
}

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
      await ensureSciencePackages(id);
      const packageError = missingPackageMessage(code);
      if (packageError)
        throw new Error(
          "Could not load a Python package needed by this program.\n" +
            packageError,
        );
      python.setStdout({ batched: (text) => append(text + "\n") });
      python.setStderr({ batched: (text) => append(text + "\n") });
      python.setStdin({ error: true });
      self.postMessage({ id, status: "Running…" });
      const globals = python.runPython("dict()");
      let figures = [];
      try {
        const result = await python.runPythonAsync(code, { globals });
        result?.destroy?.();
        if (check) {
          await python.runPythonAsync(check, { globals });
          append("\nAuthor checks passed.");
        }
      } finally {
        try {
          figures = await collectFigures();
        } catch {
          figures = [];
        }
        globals.destroy();
      }
      self.postMessage({
        id,
        done: true,
        output: output || "Completed with no output.",
        figures,
      });
      return;
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
