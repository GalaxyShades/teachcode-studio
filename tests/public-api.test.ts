import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  publicResponse,
  publicOptions,
  validatePublicIds,
} from "../lib/public-api";
import { PublicChapterSchema } from "../lib/public-contract";
import { publicDraft, CmsError } from "../lib/repository";
import { chapterExample, contentOpenApi } from "../scripts/content-openapi";
import { sampleBlocks } from "./fixtures";
import type { LessonDraft } from "../lib/content";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("content API contract", () => {
  it("validates the documented example and generates the checked-in specification", () => {
    expect(
      JSON.parse(readFileSync("docs/content-api.openapi.json", "utf8")),
    ).toEqual(contentOpenApi());
    expect(
      PublicChapterSchema.parse(
        JSON.parse(
          readFileSync("docs/examples/published-chapter.json", "utf8"),
        ),
      ),
    ).toEqual(chapterExample);
  });
  it("delivers all public card types without author-only or unexpected nested fields", () => {
    const blocks = sampleBlocks();
    const draft = {
      ...chapterExample,
      sourceMarkdown: "PRIVATE SOURCE",
      version: 99,
      privateNote: "PRIVATE ROOT",
      steps: [
        {
          id: "s",
          title: "S",
          privateNote: "PRIVATE STEP",
          blocks: [
            ...blocks.map((b) => ({ ...b, privateNote: "PRIVATE BLOCK" })),
            {
              id: "hidden",
              type: "text",
              visible: false,
              markdown: "PRIVATE HIDDEN",
            },
          ],
        },
      ],
    } as unknown as LessonDraft;
    const rendered = publicDraft(draft);
    const output = PublicChapterSchema.parse({
      ...rendered,
      ...{
        apiVersion: 1,
        courseId: chapterExample.courseId,
        chapterId: chapterExample.chapterId,
        revisionId: chapterExample.revisionId,
      },
    });
    expect(new Set(output.steps[0].blocks.map((b) => b.type)).size).toBe(9);
    const json = JSON.stringify(output);
    for (const field of [
      "PRIVATE",
      "sourceMarkdown",
      'version"',
      "solution",
      "checkScript",
      "rubric",
      "styleConfig",
      "reviewPrinciples",
      "randomisation",
      "tutor-config",
      "code-review",
    ])
      expect(json).not.toContain(field);
    const extra = structuredClone(chapterExample);
    extra.steps[0].blocks = [
      {
        id: "mcq",
        type: "mcq",
        visible: true,
        question: "Q",
        multiple: false,
        explanation: "E",
        choices: [
          { id: "a", text: "A", correct: true, privateNote: "secret" },
          { id: "b", text: "B", correct: false },
        ],
      } as never,
    ];
    expect(JSON.stringify(PublicChapterSchema.parse(extra))).not.toContain(
      "privateNote",
    );
  });
  it("rejects malformed resource IDs before executing a read", async () => {
    const read = vi.fn();
    const response = await publicResponse(
      new Request("http://studio.test"),
      async () => {
        validatePublicIds("a-title");
        return read();
      },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_ID");
    expect(read).not.toHaveBeenCalled();
    expect(() =>
      validatePublicIds(chapterExample.courseId, chapterExample.chapterId),
    ).not.toThrow();
  });
  it.each([404, 500])(
    "returns safe errors and metadata for status %s",
    async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await publicResponse(
        new Request("http://studio.test"),
        async () => {
          throw status === 404
            ? new CmsError(404, "private resource details")
            : new Error("postgres://secret:password@database");
        },
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-api-version")).toBe("1");
      expect(await response.json()).toEqual(
        status === 404
          ? {
              error: "Published content not found",
              code: "PUBLISHED_CONTENT_NOT_FOUND",
            }
          : {
              error: "Unable to load published content. Please retry later.",
              code: "INTERNAL_ERROR",
            },
      );
    },
  );
  it("grants CORS only to exact configured origins on success and preflight", async () => {
    vi.stubEnv("ALLOWED_CORS_ORIGINS", "https://learn.example.com");
    for (const origin of [
      "https://learn.example.com",
      "https://learn.example.com.evil.test",
    ]) {
      const req = new Request("http://studio.test", { headers: { origin } });
      for (const response of [
        await publicResponse(req, async () => chapterExample),
        publicOptions(req),
      ]) {
        expect(response.headers.get("access-control-allow-origin")).toBe(
          origin === "https://learn.example.com" ? origin : null,
        );
        expect(response.headers.get("vary")).toBe("Origin");
        expect(response.headers.get("access-control-allow-methods")).toBe(
          "GET, HEAD, OPTIONS",
        );
      }
    }
    expect(publicOptions(new Request("http://studio.test")).status).toBe(204);
  });
});
