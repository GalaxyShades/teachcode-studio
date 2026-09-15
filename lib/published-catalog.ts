import { db } from "./db";
import { CmsError } from "./repository";

export async function publishedCourses() {
  return (
    await db().query(
      "SELECT c.id,c.slug,c.title,c.description FROM cms_courses c WHERE c.status='published' AND EXISTS (SELECT 1 FROM cms_lessons l WHERE l.course_id=c.id AND l.status='published' AND l.published_revision_id IS NOT NULL) ORDER BY c.title,c.id",
    )
  ).rows;
}
export async function publishedCourse(courseId: string) {
  const course = (
    await db().query(
      "SELECT id,slug,title,description FROM cms_courses WHERE id=$1 AND status='published'",
      [courseId],
    )
  ).rows[0];
  if (!course) throw new CmsError(404, "Published course not found");
  const chapters = (
    await db().query(
      "SELECT l.id,l.module_id,m.slug,m.title,m.description,l.published_revision_id FROM cms_lessons l JOIN cms_revision_metadata m ON m.revision_id=l.published_revision_id WHERE l.course_id=$1 AND l.status='published' ORDER BY l.position,l.id",
      [courseId],
    )
  ).rows.map((ch) => ({
    id: ch.id,
    lessonId: ch.module_id,
    slug: ch.slug,
    title: ch.title,
    description: ch.description,
    revisionId: ch.published_revision_id,
    contentUrl: `/api/published/courses/${courseId}/lessons/${ch.id}`,
  }));
  if (!chapters.length) throw new CmsError(404, "Published course not found");
  const groups = (
    await db().query(
      "SELECT id,title FROM cms_modules WHERE course_id=$1 ORDER BY position,id",
      [courseId],
    )
  ).rows;
  return {
    ...course,
    lessons: groups
      .map((g) => ({
        ...g,
        chapters: chapters.filter((ch) => ch.lessonId === g.id),
      }))
      .filter((g) => g.chapters.length),
    unassignedChapters: chapters.filter((ch) => !ch.lessonId),
  };
}
