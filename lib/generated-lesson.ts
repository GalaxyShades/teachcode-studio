import crypto from "node:crypto";
import { db, arrayValue, isSqlite } from "./db";
import { emptyDraft } from "./cms";
import { validateDraft } from "./content";
import { parseLessonMarkdown } from "./markdown";
import { CmsError, writeRevision } from "./repository";

export function formatParseErrors(errors: { line: number; message: string }[]) {
  return errors
    .map((error) => `Line ${error.line}: ${error.message}`)
    .join("\n");
}

export async function insertGeneratedLesson(
  courseId: string,
  userId: string,
  markdown: string,
) {
  const parsed = parseLessonMarkdown(markdown, emptyDraft());
  if (!parsed.draft)
    throw new CmsError(
      400,
      formatParseErrors(parsed.errors) ||
        "The lesson Markdown could not be parsed.",
    );
  const draftErrors = validateDraft(parsed.draft);
  if (draftErrors.length) throw new CmsError(400, draftErrors.join("\n"));
  const lessonId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const draft = parsed.draft;
  const saved = { slug: draft.slug };
  await db().transaction(async (c) => {
    await c.query(
      "SELECT id FROM cms_courses WHERE id=$1" +
        (isSqlite() ? "" : " FOR UPDATE"),
      [courseId],
    );
    const used = new Set(
      (
        await c.query("SELECT slug FROM cms_lessons WHERE course_id=$1", [
          courseId,
        ])
      ).rows.map((lesson) => lesson.slug as string),
    );
    let slug = draft.slug;
    if (used.has(slug)) {
      const base = slug;
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    }
    const position = (
      await c.query(
        "SELECT coalesce(max(position),-1)+1 n FROM cms_lessons WHERE course_id=$1",
        [courseId],
      )
    ).rows[0].n;
    saved.slug = slug;
    const stored = {
      ...draft,
      slug,
      sourceMarkdown:
        slug === draft.slug
          ? draft.sourceMarkdown
          : (draft.sourceMarkdown ?? markdown).replace(
              `slug="${draft.slug}"`,
              `slug="${slug}"`,
            ),
    };
    await c.query(
      "INSERT INTO cms_lessons(id,course_id,chapter_id,slug,title,description,track,programming_language,tags,updated_by,position) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        lessonId,
        courseId,
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
    await c.query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [revisionId, lessonId, userId],
    );
    await c.query("UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2", [
      revisionId,
      lessonId,
    ]);
    await writeRevision(c, revisionId, stored, userId);
  });
  return { id: lessonId, title: draft.title, slug: saved.slug };
}
