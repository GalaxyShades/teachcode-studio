import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import {
  PublicChapterSchema,
  CourseListSchema,
  CourseOutlineSchema,
  PublicErrorSchema,
  ContentBlockSchema,
} from "../lib/public-contract";

export const chapterExample = PublicChapterSchema.parse({
  apiVersion: 1,
  courseId: "a1000000-0000-4000-8000-000000000001",
  chapterId: "a1000000-0000-4000-8000-000000000002",
  revisionId: "a1000000-0000-4000-8000-000000000003",
  title: "Your first Python program",
  slug: "first-python-program",
  description: "Use print to display a message.",
  track: "Python",
  level: "year 1",
  mode: "lesson",
  programmingLanguage: "Python",
  tags: ["beginner"],
  presentation: "guided",
  runtimeScope: "per-step",
  steps: [
    {
      id: "first-program",
      title: "Say hello",
      blocks: [
        {
          id: "intro",
          type: "text",
          visible: true,
          markdown: "Use **print** to display text.",
        },
        {
          id: "hello-example",
          type: "worked-example",
          visible: true,
          language: "python",
          code: "print('Hello')",
          explanation: "The program displays Hello.",
          runnable: true,
          expectedOutput: "Hello",
        },
      ],
    },
  ],
});
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const headers = {
  "X-Content-API-Version": {
    description: "Content contract major version.",
    schema: { type: "string", enum: ["1"] },
  },
  "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
  Vary: { schema: { type: "string", enum: ["Origin"] } },
};
const json = (name: string) => ({ "application/json": { schema: ref(name) } });
function endpoint(
  operationId: string,
  summary: string,
  schema: string,
  parameters: string[] = [],
) {
  return {
    parameters: parameters.map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
      description: "Internal ID returned by the API; not a slug.",
    })),
    get: {
      operationId,
      summary,
      responses: {
        "200": {
          description: "Current published content",
          headers,
          content: json(schema),
        },
        ...(parameters.length
          ? {
              "400": {
                description: "INVALID_ID: malformed UUID",
                headers,
                content: json("Error"),
              },
              "404": {
                description:
                  "PUBLISHED_CONTENT_NOT_FOUND: unavailable, unpublished, archived, or incorrect course/chapter pairing",
                headers,
                content: json("Error"),
              },
            }
          : {}),
        "500": {
          description:
            "INTERNAL_ERROR: retryable server failure; internal details are withheld",
          headers,
          content: json("Error"),
        },
      },
    },
    options: {
      operationId: `${operationId}Options`,
      summary: "Read-only CORS preflight",
      responses: {
        "204": {
          description:
            "No body; exact allowed origins receive Access-Control-Allow-Origin",
          headers,
        },
      },
    },
  };
}
export function contentOpenApi() {
  const schema = (value: z.ZodTypeAny) =>
    zodToJsonSchema(value, {
      target: "openApi3",
      removeAdditionalStrategy: "strict",
      $refStrategy: "none",
    });
  return {
    openapi: "3.0.3",
    info: {
      title: "TeachCode published content API",
      version: "1.0.0",
      description:
        "Public read-only content delivery. Course → lessons → chapters → steps → blocks. Student identity, progress, and grading belong to the consuming app. All requests read current publications; no historical revision endpoint.",
    },
    servers: [{ url: "/", description: "Current Studio origin" }],
    security: [],
    paths: {
      "/api/v1/content/courses": endpoint(
        "listPublishedCourses",
        "List published courses with available chapters",
        "CourseList",
      ),
      "/api/v1/content/courses/{courseId}": endpoint(
        "getPublishedCourse",
        "Read the ordered lesson and chapter outline",
        "CourseOutline",
        ["courseId"],
      ),
      "/api/v1/content/courses/{courseId}/chapters/{chapterId}": endpoint(
        "getPublishedChapter",
        "Read the current published chapter content",
        "Chapter",
        ["courseId", "chapterId"],
      ),
    },
    components: {
      schemas: {
        CourseList: schema(CourseListSchema),
        CourseOutline: schema(CourseOutlineSchema),
        Chapter: { ...schema(PublicChapterSchema), example: chapterExample },
        ContentBlock: schema(ContentBlockSchema),
        Error: schema(PublicErrorSchema),
      },
    },
  };
}
