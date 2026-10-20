import crypto from "node:crypto";
import { db, arrayValue, isSqlite } from "../db";
import { emptyDraft } from "../cms";
import { validateDraft, type LessonDraft } from "../content";
import { parseLessonMarkdown, type MarkdownError } from "../markdown";
import { CmsError, writeRevision } from "../repository";

export function formatLessonErrors(
  parseErrors: MarkdownError[],
  draftErrors: string[] = [],
) {
  return [
    ...parseErrors.map((error) => `Line ${error.line}: ${error.message}`),
    ...draftErrors,
  ];
}

/** Parse and validate. Nothing is written. */
export function inspectLessonMarkdown(markdown: string) {
  const parsed = parseLessonMarkdown(markdown, emptyDraft());
  if (!parsed.draft)
    return {
      ok: false as const,
      errors: formatLessonErrors(parsed.errors),
    };
  const draftErrors = validateDraft(parsed.draft);
  if (parsed.errors.length || draftErrors.length)
    return {
      ok: false as const,
      errors: formatLessonErrors(parsed.errors, draftErrors),
    };
  return { ok: true as const, draft: parsed.draft };
}

/**
 * Planner insert. Sets the chapter when one is given.
 * Separate from the one-shot generator's insert.
 */
export async function insertPlannerLesson(
  courseId: string,
  userId: string,
  markdown: string,
  chapterId: string | null,
) {
  const inspected = inspectLessonMarkdown(markdown);
  if (!inspected.ok)
    throw new CmsError(
      400,
      inspected.errors.join("\n") || "The lesson Markdown could not be parsed.",
    );
  const lessonId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const draft = inspected.draft;
  const saved = { slug: draft.slug };
  await db().transaction(async (client) => {
    await client.query(
      "SELECT id FROM cms_courses WHERE id=$1" +
        (isSqlite() ? "" : " FOR UPDATE"),
      [courseId],
    );
    if (
      chapterId &&
      !(
        await client.query(
          "SELECT id FROM cms_chapters WHERE id=$1 AND course_id=$2",
          [chapterId, courseId],
        )
      ).rowCount
    )
      throw new CmsError(404, "Chapter not found");
    const used = new Set(
      (
        await client.query<{ slug: string }>(
          "SELECT slug FROM cms_lessons WHERE course_id=$1",
          [courseId],
        )
      ).rows.map((lesson) => lesson.slug),
    );
    let slug = draft.slug;
    if (used.has(slug)) {
      const base = slug;
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    }
    const position = (
      await client.query<{ n: number }>(
        "SELECT coalesce(max(position),-1)+1 n FROM cms_lessons WHERE course_id=$1",
        [courseId],
      )
    ).rows[0].n;
    saved.slug = slug;
    const stored: LessonDraft = {
      ...draft,
      slug,
      sourceMarkdown:
        slug === draft.slug
          ? (draft.sourceMarkdown ?? markdown)
          : (draft.sourceMarkdown ?? markdown).replace(
              `slug="${draft.slug}"`,
              `slug="${slug}"`,
            ),
    };
    await client.query(
      "INSERT INTO cms_lessons(id,course_id,chapter_id,slug,title,description,track,programming_language,tags,updated_by,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        lessonId,
        courseId,
        chapterId,
        stored.slug,
        stored.title,
        stored.description,
        stored.track,
        stored.programmingLanguage,
        arrayValue(stored.tags),
        userId,
        position,
      ],
    );
    await client.query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [revisionId, lessonId, userId],
    );
    await client.query(
      "UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2",
      [revisionId, lessonId],
    );
    await writeRevision(client, revisionId, stored, userId);
  });
  return { id: lessonId, title: draft.title, slug: saved.slug };
}
