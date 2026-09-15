import { db } from "./db";
import { currentUser } from "./auth";
import { canAccess } from "./cms";
import { notFound, redirect } from "next/navigation";

/** UI routes accept readable slugs and legacy IDs. APIs continue using IDs. */
export async function resolveEditorCourse(
  key: string,
): Promise<{ id: string; slug: string }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const course = (
    await db().query(
      "SELECT id,slug FROM cms_courses WHERE CAST(id AS TEXT)=$1 OR slug=$1 ORDER BY CASE WHEN CAST(id AS TEXT)=$1 THEN 0 ELSE 1 END LIMIT 1",
      [key],
    )
  ).rows[0];
  if (!course || !(await canAccess(course.id, user))) notFound();
  return { id: course.id, slug: course.slug };
}

export async function resolveEditorLesson(
  courseId: string,
  key: string,
): Promise<{ id: string; slug: string }> {
  const lesson = (
    await db().query(
      "SELECT id,slug FROM cms_lessons WHERE course_id=$1 AND (CAST(id AS TEXT)=$2 OR slug=$2) ORDER BY CASE WHEN CAST(id AS TEXT)=$2 THEN 0 ELSE 1 END LIMIT 1",
      [courseId, key],
    )
  ).rows[0];
  if (!lesson) notFound();
  return { id: lesson.id, slug: lesson.slug };
}
