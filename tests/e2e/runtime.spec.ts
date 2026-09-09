import { test, expect } from "@playwright/test";
for (const [language, code] of [
  ["python", "print('runtime-ok')"],
  ["r", 'cat("runtime-ok\\n")'],
])
  test(`real ${language} worker smoke`, async ({ page }) => {
    test.skip(
      process.env.TEST_RUNTIMES !== "1",
      "Requires public runtime CDN access",
    );
    test.setTimeout(120000);
    await page.goto("/login");
    const result = await page.evaluate(
      ({ language, code }) =>
        new Promise<{ output?: string; error?: string }>((resolve, reject) => {
          const worker = new Worker("/runtime-worker.js");
          const timer = setTimeout(() => {
            worker.terminate();
            reject(new Error("Runtime load timeout"));
          }, 90000);
          worker.onmessage = ({ data }) => {
            if (data.done) {
              clearTimeout(timer);
              worker.terminate();
              resolve(data);
            }
          };
          worker.onerror = (e) => {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(e.message));
          };
          worker.postMessage({ id: "smoke", language, code });
        }),
      { language, code },
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toContain("runtime-ok");
  });
