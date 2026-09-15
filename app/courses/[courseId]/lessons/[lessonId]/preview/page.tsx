import { getDraft } from "@/lib/cms";
import { LessonPlayer } from "@/components/LessonPlayer";
import { resolveEditorCourse, resolveEditorLesson } from "@/lib/editor-routes";
import { lessonPath } from "@/lib/paths";
import { redirect } from "next/navigation";
export default async function Preview({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const p = await params;
  const course = await resolveEditorCourse(p.courseId);
  const lesson = await resolveEditorLesson(course.id, p.lessonId);
  const canonical = lessonPath(course, lesson, "preview");
  if (`/courses/${p.courseId}/lessons/${p.lessonId}/preview` !== canonical)
    redirect(canonical);
  const { draft } = await getDraft(course.id, lesson.id);
  return <LessonPlayer draft={draft} />;
}
