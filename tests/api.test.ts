import { expect, it } from "vitest";
import { sameOrigin } from "../lib/api";

it("checks the browser-facing host when Next normalizes a loopback URL", () => {
  const request = (origin: string) =>
    new Request("http://localhost:3100/api/courses", {
      headers: { host: "127.0.0.1:3100", origin },
    });
  expect(() => sameOrigin(request("http://127.0.0.1:3100"))).not.toThrow();
  for (const origin of [
    "https://evil.example",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3100",
    "null",
  ]) {
    expect(() => sameOrigin(request(origin))).toThrow("Cross-origin");
  }
  expect(() =>
    sameOrigin(
      new Request("https://studio.example/api/courses", {
        headers: { origin: "https://studio.example" },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    sameOrigin(
      new Request("https://studio.example/api/courses", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  ).toThrow("Cross-origin");
});
