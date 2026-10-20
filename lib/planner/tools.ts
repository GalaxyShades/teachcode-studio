import { z, ZodError } from "zod";
import type { User } from "../auth";
import { canAccess, coursesForUser } from "../cms";
import { db } from "../db";
import { lessonPath } from "../paths";
import { serializeLessonMarkdown } from "../markdown";
import { editChapter, moveLesson } from "../management";
import { loadRevision, persistDraft, CmsError } from "../repository";
import {
  issueValidationToken,
  validationTokenMatches,
  type ValidationGate,
} from "./gate";
import { insertPlannerLesson, inspectLessonMarkdown } from "./lesson-write";
import { attachmentText } from "./store";

export type PlannerToolContext = {
  user: User;
  threadId: string;
  gate: ValidationGate;
  /** Lesson id → draft version observed by read_lesson or create_lesson. */
  seenVersions: Map<string, number>;
};

const courseKey = z.string().trim().min(1);
const markdownArg = z.string().min(1);
const tokenArg = z.string().trim().min(1);

export const plannerToolSchemas = [
  {
    type: "function",
    function: {
      name: "list_courses",
      description:
        "List courses this teacher can access, with chapter titles and lesson slugs. Does not include lesson bodies.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_lesson",
      description:
        "Read one lesson's current draft as Markdown. Call this again before update_lesson.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string", description: "Course id or slug." },
          lessonId: { type: "string", description: "Lesson id or slug." },
        },
        required: ["courseId", "lessonId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_attachment",
      description: "Read extracted text from one file attached to this chat.",
      parameters: {
        type: "object",
        properties: {
          attachmentId: { type: "string" },
        },
        required: ["attachmentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_lesson",
      description:
        "Check lesson Markdown. On success, returns a validationToken bound to that exact text. Does not save.",
      parameters: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description:
              "The lesson itself, starting with :::lesson. Not wrapped in a code fence.",
          },
        },
        required: ["markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lesson",
      description:
        "Create a draft lesson. Requires the validationToken from validate_lesson for this exact Markdown.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          markdown: { type: "string" },
          validationToken: { type: "string" },
          chapterId: {
            type: "string",
            description:
              "Optional chapter id. Omit to leave the lesson ungrouped.",
          },
        },
        required: ["courseId", "markdown", "validationToken"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lesson",
      description:
        "Replace a draft lesson. Requires a matching validationToken and a read_lesson in this turn. Saves through the version check so a newer editor save is kept.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          markdown: { type: "string" },
          validationToken: { type: "string" },
        },
        required: ["courseId", "lessonId", "markdown", "validationToken"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_chapter",
      description: "Add a chapter to a course. Admins only.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          title: { type: "string" },
        },
        required: ["courseId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_lesson",
      description: "Place a lesson in a chapter. Admins only.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          chapterId: { type: "string" },
        },
        required: ["courseId", "lessonId", "chapterId"],
      },
    },
  },
] as const;

function fail(error: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, ...extra };
}

function invalidArgs(error: ZodError) {
  return fail(error.issues.map((issue) => issue.message).join(" "));
}

async function findCourse(key: string) {
  return (
    await db().query<{ id: string; slug: string; title: string }>(
      "SELECT id, slug, title FROM cms_courses WHERE CAST(id AS TEXT)=$1 OR slug=$1 ORDER BY CASE WHEN CAST(id AS TEXT)=$1 THEN 0 ELSE 1 END LIMIT 1",
      [key],
    )
  ).rows[0];
}

async function findLesson(courseId: string, key: string) {
  return (
    await db().query<{
      id: string;
      slug: string;
      title: string;
      version: number;
      draft_revision_id: string | null;
      chapter_id: string | null;
    }>(
      "SELECT id, slug, title, version, draft_revision_id, chapter_id FROM cms_lessons WHERE course_id=$1 AND (CAST(id AS TEXT)=$2 OR slug=$2) ORDER BY CASE WHEN CAST(id AS TEXT)=$2 THEN 0 ELSE 1 END LIMIT 1",
      [courseId, key],
    )
  ).rows[0];
}

async function accessibleCourse(key: string, user: User) {
  const course = await findCourse(key);
  if (!course || !(await canAccess(course.id, user))) return null;
  return course;
}

function lessonHref(
  course: { id: string; slug: string },
  lesson: { slug: string },
) {
  return lessonPath(course, lesson, "edit");
}

function requireValidated(
  ctx: PlannerToolContext,
  token: string,
  markdown: string,
) {
  if (!validationTokenMatches(ctx.gate, token, markdown))
    return fail(
      "Validate this exact lesson Markdown before saving it. The validation token is missing or does not match this text.",
    );
  return null;
}

export async function runPlannerTool(
  name: string,
  rawArgs: unknown,
  ctx: PlannerToolContext,
): Promise<Record<string, any>> {
  try {
    const args =
      rawArgs && typeof rawArgs === "object"
        ? rawArgs
        : typeof rawArgs === "string" && rawArgs.trim()
          ? JSON.parse(rawArgs)
          : {};
    switch (name) {
      case "list_courses":
        return await listCourses(ctx);
      case "read_lesson":
        return await readLesson(
          z.object({ courseId: courseKey, lessonId: courseKey }).parse(args),
          ctx,
        );
      case "read_attachment":
        return await readAttachment(
          z.object({ attachmentId: courseKey }).parse(args),
          ctx,
        );
      case "validate_lesson":
        return validateLesson(
          z.object({ markdown: markdownArg }).parse(args),
          ctx,
        );
      case "create_lesson":
        return await createLesson(
          z
            .object({
              courseId: courseKey,
              markdown: markdownArg,
              validationToken: tokenArg,
              chapterId: z.string().trim().min(1).nullable().optional(),
            })
            .parse(args),
          ctx,
        );
      case "update_lesson":
        return await updateLesson(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              markdown: markdownArg,
              validationToken: tokenArg,
            })
            .parse(args),
          ctx,
        );
      case "create_chapter":
        return await createChapter(
          z
            .object({ courseId: courseKey, title: z.string().trim().min(1) })
            .parse(args),
        );
      case "move_lesson":
        return await placeLesson(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              chapterId: courseKey,
            })
            .parse(args),
        );
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (error) {
    if (error instanceof ZodError) return invalidArgs(error);
    if (error instanceof SyntaxError)
      return fail("Tool arguments were not valid JSON.");
    if (error instanceof CmsError) return fail(error.message);
    throw error;
  }
}

async function listCourses(ctx: PlannerToolContext) {
  const courses = (await coursesForUser(ctx.user)).map((course) => ({
    id: String(course.id),
    slug: String(course.slug),
    title: String(course.title),
  }));
  const listed = [];
  for (const course of courses) {
    const chapters = (
      await db().query<{ id: string; title: string }>(
        "SELECT id, title FROM cms_chapters WHERE course_id=$1 ORDER BY position",
        [course.id],
      )
    ).rows;
    const lessons = (
      await db().query<{
        id: string;
        slug: string;
        title: string;
        chapter_id: string | null;
      }>(
        "SELECT id, slug, title, chapter_id FROM cms_lessons WHERE course_id=$1 ORDER BY position, created_at",
        [course.id],
      )
    ).rows.map((lesson) => ({
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      chapterId: lesson.chapter_id,
    }));
    listed.push({ ...course, chapters, lessons });
  }
  return { ok: true, courses: listed };
}

async function readLesson(
  args: { courseId: string; lessonId: string },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson?.draft_revision_id) return fail("Lesson not found");
  const draft = await loadRevision(db(), lesson, lesson.draft_revision_id);
  const version = Number(lesson.version ?? 0);
  ctx.seenVersions.set(lesson.id, version);
  return {
    ok: true,
    courseId: course.id,
    lessonId: lesson.id,
    title: draft.title,
    slug: draft.slug,
    version,
    href: lessonHref(course, draft),
    markdown: serializeLessonMarkdown(draft),
  };
}

async function readAttachment(
  args: { attachmentId: string },
  ctx: PlannerToolContext,
) {
  const file = await attachmentText(ctx.threadId, args.attachmentId);
  if (!file) return fail("Attachment not found in this chat.");
  return { ok: true, filename: file.filename, text: file.extracted_text };
}

function validateLesson(args: { markdown: string }, ctx: PlannerToolContext) {
  const inspected = inspectLessonMarkdown(args.markdown);
  if (!inspected.ok)
    return fail("The lesson Markdown is not valid.", {
      errors: inspected.errors,
    });
  return {
    ok: true,
    validationToken: issueValidationToken(ctx.gate, args.markdown),
    title: inspected.draft.title,
    slug: inspected.draft.slug,
  };
}

async function createLesson(
  args: {
    courseId: string;
    markdown: string;
    validationToken: string;
    chapterId?: string | null;
  },
  ctx: PlannerToolContext,
) {
  const rejected = requireValidated(ctx, args.validationToken, args.markdown);
  if (rejected) return rejected;
  const inspected = inspectLessonMarkdown(args.markdown);
  if (!inspected.ok)
    return fail("The lesson Markdown is not valid.", {
      errors: inspected.errors,
    });
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const saved = await insertPlannerLesson(
    course.id,
    ctx.user.id,
    args.markdown,
    args.chapterId ?? null,
  );
  ctx.seenVersions.set(saved.id, 0);
  return {
    ok: true,
    courseId: course.id,
    lessonId: saved.id,
    title: saved.title,
    slug: saved.slug,
    href: lessonHref(course, saved),
  };
}

async function updateLesson(
  args: {
    courseId: string;
    lessonId: string;
    markdown: string;
    validationToken: string;
  },
  ctx: PlannerToolContext,
) {
  const rejected = requireValidated(ctx, args.validationToken, args.markdown);
  if (rejected) return rejected;
  const inspected = inspectLessonMarkdown(args.markdown);
  if (!inspected.ok)
    return fail("The lesson Markdown is not valid.", {
      errors: inspected.errors,
    });
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson) return fail("Lesson not found");
  const seen = ctx.seenVersions.get(lesson.id);
  if (seen === undefined)
    return fail(
      "Read this lesson with read_lesson in this turn before updating it. That keeps a newer editor save from being overwritten.",
    );
  try {
    const saved = await persistDraft(
      course.id,
      lesson.id,
      { ...inspected.draft, version: seen, sourceMarkdown: args.markdown },
      ctx.user.id,
    );
    ctx.seenVersions.set(lesson.id, saved.version);
    return {
      ok: true,
      courseId: course.id,
      lessonId: lesson.id,
      title: inspected.draft.title,
      slug: inspected.draft.slug,
      version: saved.version,
      href: lessonHref(course, { slug: inspected.draft.slug }),
    };
  } catch (error) {
    if (error instanceof CmsError && error.status === 409)
      return fail(
        `${error.message} Call read_lesson, then validate_lesson, before updating again.`,
      );
    throw error;
  }
}

async function createChapter(args: { courseId: string; title: string }) {
  const course = await findCourse(args.courseId);
  if (!course) return fail("Course not found");
  const chapterId = await editChapter(course.id, {
    title: args.title,
    create: true,
  });
  return { ok: true, courseId: course.id, chapterId, title: args.title };
}

async function placeLesson(args: {
  courseId: string;
  lessonId: string;
  chapterId: string;
}) {
  const course = await findCourse(args.courseId);
  if (!course) return fail("Course not found");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson) return fail("Lesson not found");
  await moveLesson(course.id, lesson.id, args.chapterId);
  return {
    ok: true,
    courseId: course.id,
    lessonId: lesson.id,
    chapterId: args.chapterId,
    href: lessonHref(course, lesson),
  };
}
