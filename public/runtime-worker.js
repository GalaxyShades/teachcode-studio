/* Browser-only demo execution. This worker is not a security sandbox. */
let python, webR;
// Pyodide's urllib has no HTTPS handler. pandas.read_csv calls urlopen, so
// route HTTP(S) through the browser. GitHub blob/raw pages omit CORS headers;
// the file itself is served from raw.githubusercontent.com.
const browserHttpPatch = `
import re
import urllib.error
import urllib.request
from js import Uint8Array, XMLHttpRequest

_original_urlopen = urllib.request.urlopen
_github_raw = re.compile(
    r"^https://github\\.com/([^/]+)/([^/]+)/(?:raw|blob)/(.+)$"
)

def _browser_fetch_url(url):
    match = _github_raw.match(url)
    if not match:
        return url
    owner, repo, rest = match.groups()
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{rest}"

class _BrowserHeaders:
    def __init__(self, xhr):
        self._xhr = xhr

    def get(self, name, default=None):
        value = self._xhr.getResponseHeader(name)
        if value is None or value == "":
            return default
        return value

class _BrowserResponse:
    def __init__(self, body, xhr):
        self.headers = _BrowserHeaders(xhr)
        self._body = body

    def read(self, size=-1):
        if size is None or size < 0:
            data, self._body = self._body, b""
            return data
        data, self._body = self._body[:size], self._body[size:]
        return data

    def close(self):
        self._body = b""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
        return False

def _browser_urlopen(url, data=None, timeout=None, *args, **kwargs):
    target = url.full_url if isinstance(url, urllib.request.Request) else url
    if (
        data is not None
        or not isinstance(target, str)
        or not target.startswith(("http://", "https://"))
    ):
        return _original_urlopen(url, data, timeout, *args, **kwargs)
    target = _browser_fetch_url(target)
    xhr = XMLHttpRequest.new()
    xhr.open("GET", target, False)
    if isinstance(timeout, (int, float)) and timeout > 0:
        xhr.timeout = int(timeout * 1000)
    if isinstance(url, urllib.request.Request):
        for key, value in url.header_items():
            try:
                xhr.setRequestHeader(key, value)
            except Exception:
                pass
    xhr.responseType = "arraybuffer"
    try:
        xhr.send()
    except Exception as exc:
        raise urllib.error.URLError(f"Could not fetch {target}: {exc}") from None
    if xhr.status == 0:
        raise urllib.error.URLError(
            f"Could not fetch {target}. The host may be blocking browser access."
        )
    if xhr.status < 200 or xhr.status >= 300:
        raise urllib.error.HTTPError(
            target, xhr.status, str(xhr.statusText), None, None
        )
    body = b"" if xhr.response is None else bytes(Uint8Array.new(xhr.response).to_py())
    return _BrowserResponse(body, xhr)

urllib.request.urlopen = _browser_urlopen
`;
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
import warnings
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"FigureCanvasAgg is non-interactive",
)
import matplotlib.pyplot as plt

def _teachcode_show(*_args, **_kwargs):
    return None

matplotlib.pyplot.show = _teachcode_show
import io
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
    if (language === "python") {
      if (!python) {
        self.postMessage({ id, status: "Loading runtime…" });
        importScripts(
          "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js",
        );
        python = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
        });
        await python.runPythonAsync(browserHttpPatch);
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
        self.postMessage({ id, status: "Loading runtime…" });
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
