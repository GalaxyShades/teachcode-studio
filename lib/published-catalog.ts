import { CourseListSchema, CourseOutlineSchema } from "./public-contract";
import { db, readSnapshot } from "./db";
import { CmsError } from "./repository";

export async function publishedCourses() {
  return CourseListSchema.parse(
    (
      await db().query(
        "SELECT c.id,c.slug,c.title,c.description FROM cms_courses c WHERE c.status='published' AND EXISTS (SELECT 1 FROM cms_lessons l WHERE l.course_id=c.id AND l.status='published' AND l.published_revision_id IS NOT NULL) ORDER BY c.title,c.id",
      )
    ).rows,
  );
}
export async function publishedCourse(courseId: string) {
  return readSnapshot(async (client) => {
    const course = (
      await client.query(
        "SELECT id,slug,title,description FROM cms_courses WHERE id=$1 AND status='published'",
        [courseId],
      )
    ).rows[0];
    if (!course) throw new CmsError(404, "Published course not found");
    const lessons = (
      await client.query(
        "SELECT l.id,l.chapter_id,m.slug,m.title,m.description,l.published_revision_id FROM cms_lessons l JOIN cms_revision_metadata m ON m.revision_id=l.published_revision_id WHERE l.course_id=$1 AND l.status='published' ORDER BY l.position,l.id",
        [courseId],
      )
    ).rows.map((lesson) => ({
      id: lesson.id,
      chapterId: lesson.chapter_id,
      slug: lesson.slug,
      title: lesson.title,
      description: lesson.description,
      revisionId: lesson.published_revision_id,
      contentUrl: `/api/v1/content/courses/${courseId}/lessons/${lesson.id}`,
    }));
    if (!lessons.length) throw new CmsError(404, "Published course not found");
    const groups = (
      await client.query(
        "SELECT id,title FROM cms_chapters WHERE course_id=$1 ORDER BY position,id",
        [courseId],
      )
    ).rows;
    return CourseOutlineSchema.parse({
      ...course,
      chapters: groups
        .map((group) => ({
          ...group,
          lessons: lessons.filter((lesson) => lesson.chapterId === group.id),
        }))
        .filter((group) => group.lessons.length),
      unassignedLessons: lessons.filter((lesson) => !lesson.chapterId),
    });
  });
}
