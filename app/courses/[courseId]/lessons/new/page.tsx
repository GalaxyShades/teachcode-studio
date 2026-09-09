import { newLessonAction } from "@/app/actions";
import { requireAdmin } from "@/lib/cms";
export default async function NewLesson({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  await requireAdmin(courseId);
  return (
    <main className="p-6">
      <h1>Create lesson</h1>
      <form action={newLessonAction.bind(null, courseId)}>
        <button className="btn-primary">Create draft lesson</button>
      </form>
    </main>
  );
}
