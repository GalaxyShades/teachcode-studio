import LessonEditor from "@/components/LessonEditor";
import { requireCourse, getDraft } from "@/lib/cms";
import { authoringResources } from "@/lib/authoring-resources";
export default async function Edit({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const { draft } = await getDraft(courseId, lessonId);
  return (
    <LessonEditor
      courseId={courseId}
      lessonId={lessonId}
      initial={draft}
      resources={authoringResources()}
      canPublish={(await requireCourse(courseId)).role === "admin"}
    />
  );
}
