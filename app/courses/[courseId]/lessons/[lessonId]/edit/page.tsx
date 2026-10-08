import LessonEditor from "@/components/LessonEditor";
import { requireCourse, getDraft } from "@/lib/cms";
import { resolveEditorCourse, resolveEditorLesson } from "@/lib/editor-routes";
import { lessonPath } from "@/lib/paths";
import { redirect } from "next/navigation";
export default async function Edit({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const keys = await params;
  const course = await resolveEditorCourse(keys.courseId);
  const lesson = await resolveEditorLesson(course.id, keys.lessonId);
  const canonical = lessonPath(course, lesson);
  if (`/courses/${keys.courseId}/lessons/${keys.lessonId}/edit` !== canonical)
    redirect(canonical);
  const courseId = course.id,
    lessonId = lesson.id;
  const { draft, courseAssistant, lessonAssistant } = await getDraft(
    courseId,
    lessonId,
  );
  return (
    <LessonEditor
      courseId={courseId}
      courseSlug={course.slug}
      lessonId={lessonId}
      initial={draft}
      initialCourseAssistant={courseAssistant}
      initialLessonAssistant={lessonAssistant}
      canPublish={(await requireCourse(courseId)).role === "admin"}
    />
  );
}
