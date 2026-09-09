import { getDraft } from "@/lib/cms";
import { LessonPlayer } from "@/components/LessonPlayer";
export default async function Preview({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const p = await params;
  const { draft } = await getDraft(p.courseId, p.lessonId);
  return <LessonPlayer draft={draft} />;
}
