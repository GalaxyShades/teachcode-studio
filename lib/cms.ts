import crypto from "node:crypto";
import { db, isSqlite } from "./db";
import { requireUser, type User } from "./auth";
import { CmsError, loadRevision, writeRevision } from "./repository";
import { type LessonDraft } from "./content";
export async function canAccess(courseId: string, user: User) {
  if (user.role === "admin") return true;
  if (user.role !== "staff") return false;
  return !!(
    await db().query(
      "SELECT 1 FROM cms_course_staff_assignments WHERE course_id=$1 AND profile_id=$2",
      [courseId, user.id],
    )
  ).rowCount;
}
export async function requireCourse(courseId: string) {
  const user = await requireUser();
  if (!(await canAccess(courseId, user)))
    throw new CmsError(403, "Forbidden course access");
  if (
    !(await db().query("SELECT id FROM cms_courses WHERE id=$1", [courseId]))
      .rowCount
  )
    throw new CmsError(404, "Course not found");
  return user;
}
export async function requireAdmin(courseId?: string) {
  const u = courseId ? await requireCourse(courseId) : await requireUser();
  if (u.role !== "admin")
    throw new CmsError(403, "Only admins may perform this action");
  return u;
}
export async function coursesForUser(user: User) {
  if (!["admin", "staff"].includes(user.role))
    throw new CmsError(403, "No CMS access");
  return (
    await db().query(
      "SELECT DISTINCT c.*, (SELECT count(*) FROM cms_lessons l WHERE l.course_id=c.id) lesson_count FROM cms_courses c LEFT JOIN cms_course_staff_assignments a ON a.course_id=c.id WHERE $1='admin' OR a.profile_id=$2 ORDER BY c.updated_at DESC",
      [user.role, user.id],
    )
  ).rows;
}
export async function getCourse(id: string) {
  const user = await requireCourse(id);
  return {
    course: (await db().query("SELECT * FROM cms_courses WHERE id=$1", [id]))
      .rows[0],
    modules: (
      await db().query(
        "SELECT * FROM cms_modules WHERE course_id=$1 ORDER BY position",
        [id],
      )
    ).rows,
    lessons: (
      await db().query(
        "SELECT * FROM cms_lessons WHERE course_id=$1 ORDER BY position,created_at",
        [id],
      )
    ).rows,
    staff:
      user.role === "admin"
        ? (
            await db().query(
              "SELECT p.id,p.display_name,p.email FROM cms_course_staff_assignments a JOIN profiles p ON p.id=a.profile_id WHERE a.course_id=$1",
              [id],
            )
          ).rows
        : [],
    user,
  };
}
export async function createCourse(form: FormData) {
  const u = await requireAdmin(),
    courseId = crypto.randomUUID();
  const title = String(form.get("title") || "").trim(),
    slug = String(form.get("slug") || "");
  if (!title || !/^[a-z0-9-]+$/.test(slug))
    throw new CmsError(400, "Title and lowercase URL slug are required");
  await db().transaction(async (c) => {
    await c.query(
      "INSERT INTO cms_courses(id,slug,title,description,created_by) VALUES($1,$2,$3,$4,$5)",
      [courseId, slug, title, String(form.get("description") || ""), u.id],
    );
    await c.query(
      "INSERT INTO cms_modules(id,course_id,title,position) VALUES($1,$2,'Getting started',0)",
      [crypto.randomUUID(), courseId],
    );
  });
  return courseId;
}
export function emptyDraft(): LessonDraft {
  return {
    title: "Untitled chapter",
    slug: "untitled",
    description: "",
    track: "Python",
    level: "year 1",
    mode: "lesson",
    programmingLanguage: "Python",
    tags: [],
    presentation: "guided",
    runtimeScope: "per-step",
    version: 0,
    steps: [{ id: crypto.randomUUID(), title: "Step 1", blocks: [] }],
  };
}
export async function createLesson(courseId: string, moduleId?: string | null) {
  const u = await requireAdmin(courseId),
    lessonId = crypto.randomUUID(),
    revisionId = crypto.randomUUID();
  await db().transaction(async (c) => {
    // Serialize name allocation for concurrent lesson creation in this course.
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
      ).rows.map((lesson) => lesson.slug),
    );
    let slug = "new-lesson";
    for (let n = 2; used.has(slug); n++) slug = `new-lesson-${n}`;
    const module = (
      await c.query(
        "SELECT id FROM cms_modules WHERE course_id=$1 ORDER BY position",
        [courseId],
      )
    ).rows[0];
    if (
      moduleId &&
      !(
        await c.query(
          "SELECT id FROM cms_modules WHERE id=$1 AND course_id=$2",
          [moduleId, courseId],
        )
      ).rowCount
    )
      throw new CmsError(404, "Lesson not found");
    const draft = {
      ...emptyDraft(),
      slug,
    };
    const position = (
      await c.query(
        "SELECT coalesce(max(position),-1)+1 n FROM cms_lessons WHERE course_id=$1",
        [courseId],
      )
    ).rows[0].n;
    await c.query(
      "INSERT INTO cms_lessons(id,course_id,module_id,slug,title,updated_by,position) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        lessonId,
        courseId,
        moduleId === undefined ? (module?.id ?? null) : moduleId,
        draft.slug,
        draft.title,
        u.id,
        position,
      ],
    );
    await c.query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [revisionId, lessonId, u.id],
    );
    await c.query("UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2", [
      revisionId,
      lessonId,
    ]);
    await writeRevision(c, revisionId, draft, u.id);
  });
  return lessonId;
}
export async function getDraft(courseId: string, lessonId: string) {
  await requireCourse(courseId);
  const lesson = (
    await db().query("SELECT * FROM cms_lessons WHERE id=$1 AND course_id=$2", [
      lessonId,
      courseId,
    ])
  ).rows[0];
  if (!lesson) throw new CmsError(404, "Lesson not found");
  return {
    lesson,
    draft: await loadRevision(db(), lesson, lesson.draft_revision_id),
  };
}
