import { describe, it, expect, vi, afterEach } from "vitest";
class FakeWorker {
  static last: FakeWorker;
  onmessage: any;
  onerror: any;
  terminated = false;
  request: any;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(data: any) {
    this.request = data;
  }
  terminate() {
    this.terminated = true;
  }
  send(data: any) {
    this.onmessage?.({ data: { id: this.request.id, ...data } });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("browser runtime controller", () => {
  it("caches a runtime and forwards output", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { execute } = await import("../lib/runtime");
    const first = execute("python", "print(1)", () => {});
    const worker = FakeWorker.last;
    worker.send({ done: true, output: "1" });
    expect(await first.promise).toBe("1");
    const next = execute("python", "print(2)", () => {});
    expect(FakeWorker.last).toBe(worker);
    worker.send({ done: true, output: "2" });
    expect(await next.promise).toBe("2");
  });
  it("terminates infinite execution and allows a fresh runtime", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const { execute } = await import("../lib/runtime");
    const task = execute("python", "while True: pass", () => {});
    const rejection = expect(task.promise).rejects.toThrow("10 seconds");
    FakeWorker.last.send({ status: "Running…" });
    await vi.advanceTimersByTimeAsync(10001);
    await rejection;
    expect(FakeWorker.last.terminated).toBe(true);
  });
  it("cancels R and reports errors", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { execute } = await import("../lib/runtime");
    const task = execute("r", "repeat {}", () => {});
    const rejection = expect(task.promise).rejects.toThrow("cancelled");
    task.cancel();
    await rejection;
    const next = execute("r", "bad()", () => {});
    FakeWorker.last.send({ done: true, error: "R error" });
    await expect(next.promise).rejects.toThrow("R error");
  });
});
