import { newLessonAction } from "@/app/actions";
import { requireAdmin } from "@/lib/cms";
import { resolveEditorCourse } from "@/lib/editor-routes";
import { coursePath } from "@/lib/paths";
import { redirect } from "next/navigation";
export default async function NewLesson({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId: key } = await params;
  const course = await resolveEditorCourse(key);
  const courseId = course.id;
  await requireAdmin(courseId);
  const canonical = `${coursePath(course)}/lessons/new`;
  if (`/courses/${key}/lessons/new` !== canonical) redirect(canonical);
  return (
    <main className="p-6">
      <h1>Create lesson</h1>
      <form action={newLessonAction.bind(null, courseId)}>
        <button className="btn-primary">Create draft lesson</button>
      </form>
    </main>
  );
}
