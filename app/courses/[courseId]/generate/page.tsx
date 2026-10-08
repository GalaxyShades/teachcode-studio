import { getCourse } from "@/lib/cms";
import { GenerateLesson } from "@/components/GenerateLesson";
import { authoringResources } from "@/lib/authoring-resources";
import { resolveEditorCourse } from "@/lib/editor-routes";
import { coursePath, generateLessonPath } from "@/lib/paths";
import { redirect } from "next/navigation";

export default async function GenerateLessonPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId: key } = await params;
  const resolved = await resolveEditorCourse(key);
  const path = generateLessonPath(resolved);
  if (`/courses/${key}/generate` !== path) redirect(path);
  const { course } = await getCourse(resolved.id);
  const resources = authoringResources();
  return (
    <GenerateLesson
      courseId={resolved.id}
      courseHref={coursePath(resolved)}
      courseTitle={String(course.title)}
      template={resources.template}
      prompt={resources.prompt}
    />
  );
}
