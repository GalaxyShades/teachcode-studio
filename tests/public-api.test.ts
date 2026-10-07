import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  publicResponse,
  publicOptions,
  validatePublicIds,
} from "../lib/public-api";
import { PublicLessonSchema } from "../lib/public-contract";
import { publicDraft, CmsError } from "../lib/repository";
import { lessonExample, contentOpenApi } from "../scripts/content-openapi";
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
      PublicLessonSchema.parse(
        JSON.parse(readFileSync("docs/examples/published-lesson.json", "utf8")),
      ),
    ).toEqual(lessonExample);
  });
  it("delivers all public card types without author-only or unexpected nested fields", () => {
    const blocks = sampleBlocks();
    const draft = {
      ...lessonExample,
      sourceMarkdown: "PRIVATE SOURCE",
      version: 99,
      privateNote: "PRIVATE ROOT",
      courseAssistant: {
        suggestedQuestions: "PRIVATE_COURSE_ASSISTANT",
        constraints: "PRIVATE_COURSE_CONSTRAINT",
      },
      lessonAssistant: {
        suggestedQuestions: "PRIVATE_LESSON_ASSISTANT",
        constraints: "PRIVATE_LESSON_CONSTRAINT",
      },
      steps: [
        {
          id: "s",
          title: "S",
          privateNote: "PRIVATE STEP",
          blocks: [
            ...blocks.map((b) =>
              b.type === "code-exercise"
                ? {
                    ...b,
                    privateNote: "PRIVATE BLOCK",
                    additionalPenalties: "PRIVATE_PENALTY",
                    ignoredIssues: "PRIVATE_IGNORE",
                    issuesToIgnore: "PRIVATE_OLD_IGNORE",
                    prompt: "PRIVATE_OLD_PROMPT",
                    solution: "PRIVATE_SOLUTION",
                    checkScript: "PRIVATE_CHECK",
                  }
                : { ...b, privateNote: "PRIVATE BLOCK" },
            ),
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
    const output = PublicLessonSchema.parse({
      ...rendered,
      ...{
        apiVersion: 1,
        courseId: lessonExample.courseId,
        lessonId: lessonExample.lessonId,
        revisionId: lessonExample.revisionId,
      },
    });
    expect(new Set(output.steps[0].blocks.map((b) => b.type)).size).toBe(9);
    const exercise = output.steps[0].blocks.find(
      (b) => b.type === "code-exercise",
    );
    expect(exercise).toMatchObject({
      instructions: 'Set `greeting` to `"Hello"`, then print it.',
    });
    expect(exercise).not.toHaveProperty("prompt");
    expect(exercise).not.toHaveProperty("ignoredIssues");
    expect(exercise).not.toHaveProperty("issuesToIgnore");
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
      "PRIVATE_SOLUTION",
      "PRIVATE_CHECK",
      "additionalPenalties",
      "ignoredIssues",
      "issuesToIgnore",
      "suggestedQuestions",
      "chips",
      "PRIVATE_PENALTY",
      "PRIVATE_IGNORE",
      "PRIVATE_OLD_IGNORE",
      "PRIVATE_OLD_PROMPT",
      "courseAssistant",
      "lessonAssistant",
      "PRIVATE_COURSE_ASSISTANT",
      "PRIVATE_LESSON_ASSISTANT",
    ])
      expect(json).not.toContain(field);
    const extra = structuredClone(lessonExample);
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
    expect(JSON.stringify(PublicLessonSchema.parse(extra))).not.toContain(
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
      validatePublicIds(lessonExample.courseId, lessonExample.lessonId),
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
        await publicResponse(req, async () => lessonExample),
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
