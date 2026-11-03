import { z, ZodError } from "zod";
import type { User } from "../auth";
import { canAccess, coursesForUser } from "../cms";
import { db } from "../db";
import { lessonPath } from "../paths";
import {
  BlockSchema,
  validateDraft,
  type Block,
  type LessonDraft,
} from "../content";
import { serializeLessonMarkdown } from "../markdown";
import { editChapter, moveLesson } from "../management";
import {
  loadRevision,
  persistDraft,
  restoreRevision,
  CmsError,
} from "../repository";
import {
  issueValidationToken,
  validationTokenMatches,
  type ValidationGate,
} from "./gate";
import {
  cardWithStableId,
  insertPlannerLesson,
  inspectLessonMarkdown,
  parseCardMarkdown,
  prepareInsertedCard,
} from "./lesson-write";
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
const indexArg = z.number().int().nonnegative();

export const plannerToolSchemas = [
  {
    type: "function",
    function: {
      name: "list_courses",
      description:
        "List courses this teacher can access, with chapter ids and titles and lesson ids and slugs. Does not include lesson bodies. Use a chapter id with rename_chapter.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_lesson",
      description:
        "Read one lesson's current draft as Markdown, including step and card ids, plus the published revision ids restore_draft accepts. Call this again before update_lesson, update_card, insert_card, delete_card, move_card, patch_card, update_lesson_details, or restore_draft.",
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
        "Replace a whole draft lesson. Requires a matching validationToken and a read_lesson in this turn. Saves through the version check so a newer editor save is kept. For one card, use update_card, insert_card, delete_card, move_card, or patch_card. For a title, slug, or description, use update_lesson_details. To put a published snapshot back, use restore_draft.",
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
      name: "update_card",
      description:
        "Replace one card in a draft lesson by its id. Keeps that id and does not change any other card. Call read_lesson in this turn first. Pass one card's Markdown, not the whole lesson. The server loads the draft, validates the card, and saves through the version check. Use update_lesson only for a broad rewrite.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          cardId: {
            type: "string",
            description: "Id of the existing card, copied from read_lesson.",
          },
          markdown: {
            type: "string",
            description:
              "The replacement card only, starting with its ::: directive. Not a whole lesson and not a code fence.",
          },
        },
        required: ["courseId", "lessonId", "cardId", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_card",
      description:
        "Insert one new card into a step at a 0-based position. Call read_lesson in this turn first. Pass one card's Markdown. A lowercase hyphenated id is kept when it is free; otherwise the server assigns one. Does not change other cards. Use the step's card count as the position to append.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          stepId: {
            type: "string",
            description: "Step id copied from read_lesson.",
          },
          position: {
            type: "integer",
            minimum: 0,
            description:
              "0-based index in that step. The step's current card count appends the card.",
          },
          markdown: {
            type: "string",
            description:
              "The new card only, starting with its ::: directive. Not a whole lesson and not a code fence.",
          },
        },
        required: ["courseId", "lessonId", "stepId", "position", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_card",
      description:
        "Delete one card by its id. Call read_lesson in this turn first. Does not change any other card. Saves through the version check.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          cardId: {
            type: "string",
            description: "Id of the card to remove, copied from read_lesson.",
          },
        },
        required: ["courseId", "lessonId", "cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_card",
      description:
        "Move one existing card to a destination step and a 0-based position in that step, in one save. Call read_lesson in this turn first. Does not change the card's fields or any other card. Use this instead of update_lesson, update_card, or deleting and inserting the card. In the card's current step, the last position is one less than that step's card count. In a different step, that step's card count appends the card.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          cardId: {
            type: "string",
            description: "Id of the card to move, copied from read_lesson.",
          },
          stepId: {
            type: "string",
            description: "Destination step id copied from read_lesson.",
          },
          position: {
            type: "integer",
            minimum: 0,
            description:
              "0-based index in the destination step after the move.",
          },
        },
        required: ["courseId", "lessonId", "cardId", "stepId", "position"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "patch_card",
      description:
        "Change one or more named fields on one card, such as instructions or checkScript, without resending the card. Call read_lesson in this turn first. The fields object lists only the fields that change. The server keeps the card id and every omitted field. Use this instead of update_card or update_lesson when the rest of the card should stay. Rejects an unknown field.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          cardId: {
            type: "string",
            description: "Id of the existing card, copied from read_lesson.",
          },
          fields: {
            type: "object",
            description:
              "Card fields to merge onto the existing card. Keys must be real fields of that card, such as instructions or checkScript. Do not send id, type, or the whole card.",
            additionalProperties: true,
          },
        },
        required: ["courseId", "lessonId", "cardId", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lesson_details",
      description:
        "Change the lesson title, slug, and/or description without rewriting cards or steps. Pass only the details that change. A title change does not change the slug. Call read_lesson in this turn first. Use this instead of update_lesson. A slug is lowercase letters, digits, and hyphens. The lesson address becomes that slug; opening the lesson by its id still redirects to the current slug. Staff and admin access matches update_lesson.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          title: { type: "string", description: "New lesson title." },
          slug: {
            type: "string",
            description:
              "New readable slug: lowercase letters, digits, and hyphens. Omit to keep the current slug.",
          },
          description: { type: "string", description: "New lesson description." },
        },
        required: ["courseId", "lessonId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restore_draft",
      description:
        "Replace the working draft with one published snapshot. Pass a revision id from read_lesson. This does not publish and does not unarchive. Call read_lesson in this turn first. Use this instead of update_lesson. Confirm with the teacher first: restoring replaces the current draft, including unpublished edits, and readers keep the current publication until someone publishes again. Assigned staff can restore, same as the lesson editor.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          revisionId: {
            type: "string",
            description:
              "Published revision id copied from read_lesson revisions. This is the id version history uses.",
          },
        },
        required: ["courseId", "lessonId", "revisionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_lesson",
      description:
        "Archive one lesson. This is the lesson editor's Archive action: the lesson row stays, its public copy is cleared, and it is not hard-deleted. Only an admin can do this. Confirm with the teacher before calling, because the editor asks before it changes public availability. Do not use this to remove a card.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
        },
        required: ["courseId", "lessonId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_chapter",
      description:
        "Rename one chapter. Pass the chapter id from list_courses and the new title. Does not add a chapter and does not move lessons. Staff can do this on courses assigned to them, same as the course outline. Call it once the teacher has given the title; the editor saves a chapter title without a second confirmation.",
      parameters: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          chapterId: {
            type: "string",
            description: "Chapter id copied from list_courses.",
          },
          title: { type: "string", description: "New chapter title." },
        },
        required: ["courseId", "chapterId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_chapter",
      description:
        "Add a chapter to a course this teacher can access. Staff can do this on courses assigned to them. Creating a chapter can mean an empty chapter with no lessons, or a chapter plus lessons. If the teacher asked to create or add a chapter and has not already said which, ask a short clarifying question and do not call this tool, create_lesson, or move_lesson yet. After they answer, do only what they chose. If the same message already says empty or names the lessons, call this tool without asking again.",
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
      description:
        "Place a lesson in a chapter on a course this teacher can access. Staff can do this on courses assigned to them.",
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
      published_revision_id: string | null;
      chapter_id: string | null;
    }>(
      "SELECT id, slug, title, version, draft_revision_id, published_revision_id, chapter_id FROM cms_lessons WHERE course_id=$1 AND (CAST(id AS TEXT)=$2 OR slug=$2) ORDER BY CASE WHEN CAST(id AS TEXT)=$2 THEN 0 ELSE 1 END LIMIT 1",
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
      case "update_card":
        return await updateCard(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              cardId: courseKey,
              markdown: markdownArg,
            })
            .parse(args),
          ctx,
        );
      case "insert_card":
        return await insertCard(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              stepId: courseKey,
              position: indexArg,
              markdown: markdownArg,
            })
            .parse(args),
          ctx,
        );
      case "delete_card":
        return await deleteCard(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              cardId: courseKey,
            })
            .parse(args),
          ctx,
        );
      case "move_card":
        return await moveCard(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              cardId: courseKey,
              stepId: courseKey,
              position: indexArg,
            })
            .parse(args),
          ctx,
        );
      case "patch_card":
        return await patchCard(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              cardId: courseKey,
              fields: z
                .record(z.unknown())
                .refine((fields) => Object.keys(fields).length > 0, {
                  message: "Name at least one card field to change.",
                }),
            })
            .parse(args),
          ctx,
        );
      case "update_lesson_details":
        return await updateLessonDetails(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              title: z.string().trim().min(1).optional(),
              slug: z.string().trim().min(1).optional(),
              description: z.string().optional(),
            })
            .parse(args),
          ctx,
        );
      case "restore_draft":
        return await restoreDraft(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
              revisionId: courseKey,
            })
            .parse(args),
          ctx,
        );
      case "delete_lesson":
        return await deleteLesson(
          z
            .object({
              courseId: courseKey,
              lessonId: courseKey,
            })
            .parse(args),
          ctx,
        );
      case "rename_chapter":
        return await renameChapter(
          z
            .object({
              courseId: courseKey,
              chapterId: courseKey,
              title: z.string().trim().min(1),
            })
            .parse(args),
          ctx,
        );
      case "create_chapter":
        return await createChapter(
          z
            .object({ courseId: courseKey, title: z.string().trim().min(1) })
            .parse(args),
          ctx,
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
          ctx,
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
  const revisions = (
    await db().query<{
      id: string;
      revision_number: number;
      title: string;
    }>(
      "SELECT r.id, r.revision_number, m.title FROM cms_lesson_revisions r JOIN cms_revision_metadata m ON m.revision_id=r.id WHERE r.lesson_id=$1 AND r.state='published' ORDER BY r.revision_number DESC LIMIT 5",
      [lesson.id],
    )
  ).rows.map((row) => ({
    id: row.id,
    revisionNumber: Number(row.revision_number),
    title: row.title,
  }));
  return {
    ok: true,
    courseId: course.id,
    lessonId: lesson.id,
    title: draft.title,
    slug: draft.slug,
    version,
    href: lessonHref(course, draft),
    markdown: serializeLessonMarkdown(draft),
    revisions,
    publishedRevisionId: lesson.published_revision_id,
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

type CardRevision =
  | { ok: true; draft: LessonDraft; cardId?: string }
  | { ok: false; error: string; errors?: string[] };

const readableSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cardFieldNames(type: Block["type"]) {
  const names = new Set<string>();
  for (const option of BlockSchema.options) {
    if (option.shape.type.value !== type) continue;
    for (const key of Object.keys(option.shape)) {
      if (key !== "id" && key !== "type") names.add(key);
    }
  }
  return names;
}

function lessonHasCard(draft: LessonDraft, cardId: string) {
  return draft.steps.some((step) =>
    step.blocks.some((block) => block.id === cardId),
  );
}

function rejectedCard(errors: string[]): CardRevision {
  if (
    errors.length === 1 &&
    /send (exactly )?one card|not a whole lesson/i.test(errors[0])
  )
    return { ok: false, error: errors[0] };
  return { ok: false, error: "That card is not valid.", errors };
}

function blockIds(draft: LessonDraft) {
  return new Set(
    draft.steps.flatMap((step) => step.blocks.map((block) => block.id)),
  );
}

/**
 * Load the current draft, edit it in memory, and save through the same
 * version check as update_lesson. One check, one write. A rejected edit
 * returns before that write.
 */
async function reviseLessonCard(
  args: { courseId: string; lessonId: string },
  ctx: PlannerToolContext,
  edit: (draft: LessonDraft) => CardRevision,
  messages: { invalid: string; stale: string } = {
    invalid: "That card is not valid.",
    stale: "Call read_lesson before editing a card again.",
  },
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson?.draft_revision_id) return fail("Lesson not found");
  const seen = ctx.seenVersions.get(lesson.id);
  if (seen === undefined)
    return fail(
      "Read this lesson with read_lesson in this turn before updating it. That keeps a newer editor save from being overwritten.",
    );
  const edited = edit(
    await loadRevision(db(), lesson, lesson.draft_revision_id),
  );
  if (!edited.ok)
    return fail(edited.error, edited.errors ? { errors: edited.errors } : {});
  const errors = validateDraft(edited.draft);
  if (errors.length) return fail(messages.invalid, { errors });
  const next: LessonDraft = {
    ...edited.draft,
    version: seen,
    sourceMarkdown: serializeLessonMarkdown(edited.draft),
  };
  try {
    const saved = await persistDraft(course.id, lesson.id, next, ctx.user.id);
    ctx.seenVersions.set(lesson.id, saved.version);
    return {
      ok: true,
      courseId: course.id,
      lessonId: lesson.id,
      title: next.title,
      slug: next.slug,
      version: saved.version,
      ...(edited.cardId ? { cardId: edited.cardId } : {}),
      href: lessonHref(course, { slug: next.slug }),
    };
  } catch (error) {
    if (error instanceof CmsError && error.status === 409) {
      if (/^This lesson changed/.test(error.message))
        return fail(`${error.message} ${messages.stale}`, { status: 409 });
      return fail(error.message, { status: error.status });
    }
    throw error;
  }
}

async function updateCard(
  args: {
    courseId: string;
    lessonId: string;
    cardId: string;
    markdown: string;
  },
  ctx: PlannerToolContext,
) {
  return reviseLessonCard(args, ctx, (draft) => {
    if (!lessonHasCard(draft, args.cardId))
      return { ok: false, error: "Unknown card id." };
    const parsed = parseCardMarkdown(args.markdown);
    if (!parsed.ok) return rejectedCard(parsed.errors);
    return {
      ok: true,
      cardId: args.cardId,
      draft: {
        ...draft,
        steps: draft.steps.map((step) => ({
          ...step,
          blocks: step.blocks.map((block) =>
            block.id === args.cardId
              ? cardWithStableId(parsed.block, args.cardId)
              : block,
          ),
        })),
      },
    };
  });
}

async function insertCard(
  args: {
    courseId: string;
    lessonId: string;
    stepId: string;
    position: number;
    markdown: string;
  },
  ctx: PlannerToolContext,
) {
  return reviseLessonCard(args, ctx, (draft) => {
    const step = draft.steps.find((item) => item.id === args.stepId);
    if (!step) return { ok: false, error: "Unknown step id." };
    if (args.position > step.blocks.length)
      return {
        ok: false,
        error: `That position is outside this step. The step has ${step.blocks.length} cards; use 0 through ${step.blocks.length}.`,
      };
    const parsed = parseCardMarkdown(args.markdown);
    if (!parsed.ok) return rejectedCard(parsed.errors);
    const prepared = prepareInsertedCard(parsed.block, blockIds(draft));
    if (!prepared.ok) return prepared;
    return {
      ok: true,
      cardId: prepared.block.id,
      draft: {
        ...draft,
        steps: draft.steps.map((item) => {
          if (item.id !== args.stepId) return item;
          const blocks = [...item.blocks];
          blocks.splice(args.position, 0, prepared.block);
          return { ...item, blocks };
        }),
      },
    };
  });
}

async function deleteCard(
  args: { courseId: string; lessonId: string; cardId: string },
  ctx: PlannerToolContext,
) {
  return reviseLessonCard(args, ctx, (draft) => {
    if (!lessonHasCard(draft, args.cardId))
      return { ok: false, error: "Unknown card id." };
    return {
      ok: true,
      cardId: args.cardId,
      draft: {
        ...draft,
        steps: draft.steps.map((step) => ({
          ...step,
          blocks: step.blocks.filter((block) => block.id !== args.cardId),
        })),
      },
    };
  });
}

async function moveCard(
  args: {
    courseId: string;
    lessonId: string;
    cardId: string;
    stepId: string;
    position: number;
  },
  ctx: PlannerToolContext,
) {
  return reviseLessonCard(args, ctx, (draft) => {
    const from = draft.steps.findIndex((step) =>
      step.blocks.some((block) => block.id === args.cardId),
    );
    if (from < 0) return { ok: false, error: "Unknown card id." };
    const to = draft.steps.findIndex((step) => step.id === args.stepId);
    if (to < 0) return { ok: false, error: "Unknown step id." };
    const blockIndex = draft.steps[from].blocks.findIndex(
      (block) => block.id === args.cardId,
    );
    const destinationCount =
      draft.steps[to].blocks.length - (from === to ? 1 : 0);
    if (args.position > destinationCount) {
      const count = draft.steps[to].blocks.length;
      const last = destinationCount;
      return {
        ok: false,
        error:
          from === to
            ? `That position is outside this step. This step has ${count} cards including this one. Use 0 through ${last}.`
            : `That position is outside this step. This step has ${count} cards. Use 0 through ${last}.`,
      };
    }
    const steps = draft.steps.map((step) => ({
      ...step,
      blocks: [...step.blocks],
    }));
    const [moved] = steps[from].blocks.splice(blockIndex, 1);
    steps[to].blocks.splice(args.position, 0, moved);
    return { ok: true, cardId: args.cardId, draft: { ...draft, steps } };
  });
}

async function patchCard(
  args: {
    courseId: string;
    lessonId: string;
    cardId: string;
    fields: Record<string, unknown>;
  },
  ctx: PlannerToolContext,
) {
  return reviseLessonCard(args, ctx, (draft) => {
    const current = draft.steps
      .flatMap((step) => step.blocks)
      .find((block) => block.id === args.cardId);
    if (!current) return { ok: false, error: "Unknown card id." };
    const allowed = cardFieldNames(current.type);
    const unknown = Object.keys(args.fields).filter((key) => !allowed.has(key));
    if (unknown.length)
      return {
        ok: false,
        error: `Unknown card field ${unknown.map((key) => `"${key}"`).join(", ")}.`,
      };
    const parsed = BlockSchema.safeParse({ ...current, ...args.fields });
    if (!parsed.success)
      return {
        ok: false,
        error: "That card is not valid.",
        errors: parsed.error.issues.map(
          (issue) =>
            `${issue.path.join(".")}: ${issue.message}`.replace(/^: /, ""),
        ),
      };
    if (parsed.data.id !== args.cardId)
      return { ok: false, error: "Cannot change the card id." };
    return {
      ok: true,
      cardId: args.cardId,
      draft: {
        ...draft,
        steps: draft.steps.map((step) => ({
          ...step,
          blocks: step.blocks.map((block) =>
            block.id === args.cardId ? parsed.data : block,
          ),
        })),
      },
    };
  });
}

async function updateLessonDetails(
  args: {
    courseId: string;
    lessonId: string;
    title?: string;
    slug?: string;
    description?: string;
  },
  ctx: PlannerToolContext,
) {
  const changes: Partial<Pick<LessonDraft, "title" | "slug" | "description">> =
    {};
  if (args.title !== undefined) changes.title = args.title;
  if (args.slug !== undefined) changes.slug = args.slug;
  if (args.description !== undefined) changes.description = args.description;
  if (!Object.keys(changes).length)
    return fail("Name the title, slug, or description to change.");
  if (args.slug !== undefined && !readableSlug.test(args.slug))
    return fail(
      "Slug must use lowercase letters, digits, and hyphens, and it cannot start or end with a hyphen.",
    );
  return reviseLessonCard(
    args,
    ctx,
    (draft) => ({
      ok: true,
      draft: { ...draft, ...changes },
    }),
    {
      invalid: "Those lesson details are not valid.",
      stale: "Call read_lesson before updating the lesson details again.",
    },
  );
}

async function restoreDraft(
  args: { courseId: string; lessonId: string; revisionId: string },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson?.draft_revision_id) return fail("Lesson not found");
  const seen = ctx.seenVersions.get(lesson.id);
  if (seen === undefined)
    return fail(
      "Read this lesson with read_lesson in this turn before restoring it. That keeps a newer editor save from being overwritten.",
    );
  const revision = (
    await db().query(
      "SELECT id FROM cms_lesson_revisions WHERE id=$1 AND lesson_id=$2 AND state='published'",
      [args.revisionId, lesson.id],
    )
  ).rows[0];
  if (!revision)
    return fail(
      "This published version is no longer available. Refresh version history.",
    );
  try {
    const saved = await restoreRevision(
      course.id,
      lesson.id,
      args.revisionId,
      seen,
      ctx.user.id,
    );
    ctx.seenVersions.set(lesson.id, saved.version);
    return {
      ok: true,
      courseId: course.id,
      lessonId: lesson.id,
      title: saved.draft.title,
      slug: saved.draft.slug,
      version: saved.version,
      revisionId: args.revisionId,
      href: lessonHref(course, { slug: saved.draft.slug }),
    };
  } catch (error) {
    if (error instanceof CmsError && error.status === 409)
      return fail(
        `${error.message} Call read_lesson before restoring again.`,
        { status: 409 },
      );
    if (error instanceof CmsError) return fail(error.message);
    throw error;
  }
}

async function deleteLesson(
  args: { courseId: string; lessonId: string },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  if (ctx.user.role !== "admin")
    return fail("Only admins may perform this action");
  const lesson = await findLesson(course.id, args.lessonId);
  if (!lesson) return fail("Lesson not found");
  // Same write as unpublishDraft(..., true), which is the editor's Archive
  // action and the lesson DELETE route. The row stays; it is not hard-deleted.
  const archived = await db().query(
    "UPDATE cms_lessons SET published_revision_id=NULL,status=$1,version=version+1 WHERE id=$2 AND course_id=$3",
    ["archived", lesson.id, course.id],
  );
  if (!archived.rowCount) return fail("Lesson not found");
  return {
    ok: true,
    courseId: course.id,
    lessonId: lesson.id,
    archived: true,
  };
}

async function renameChapter(
  args: { courseId: string; chapterId: string; title: string },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const chapter = (
    await db().query(
      "SELECT id FROM cms_chapters WHERE id=$1 AND course_id=$2",
      [args.chapterId, course.id],
    )
  ).rows[0];
  if (!chapter) return fail("Chapter not found");
  await editChapter(course.id, { id: args.chapterId, title: args.title });
  return {
    ok: true,
    courseId: course.id,
    chapterId: args.chapterId,
    title: args.title,
  };
}

async function createChapter(
  args: { courseId: string; title: string },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
  const chapterId = await editChapter(course.id, {
    title: args.title,
    create: true,
  });
  return { ok: true, courseId: course.id, chapterId, title: args.title };
}

async function placeLesson(
  args: {
    courseId: string;
    lessonId: string;
    chapterId: string;
  },
  ctx: PlannerToolContext,
) {
  const course = await accessibleCourse(args.courseId, ctx.user);
  if (!course) return fail("You do not have access to that course.");
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
