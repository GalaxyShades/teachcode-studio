import { db } from "@/lib/db";
import { publishedLesson } from "@/lib/repository";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/LessonPlayer";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ courseSlug: string; lessonSlug: string }> };
async function load(params: Props["params"]) {
  const p = await params;
  const l = (
    await db().query(
      "SELECT l.id,l.course_id FROM cms_lessons l JOIN cms_courses c ON c.id=l.course_id JOIN cms_revision_metadata m ON m.revision_id=l.published_revision_id WHERE c.slug=$1 AND m.slug=$2",
      [p.courseSlug, p.lessonSlug],
    )
  ).rows[0];
  if (!l) notFound();
  try {
    return await publishedLesson(l.course_id, l.id);
  } catch (e) {
    if ((e as any).status === 404) notFound();
    throw e;
  }
}
export async function generateMetadata({ params }: Props) {
  const draft = await load(params);
  const p = await params;
  return {
    title: `${draft.title} | TeachCode`,
    description: draft.description,
    alternates: {
      canonical: `/published/courses/${p.courseSlug}/lessons/${p.lessonSlug}`,
    },
  };
}
export default async function Published({ params }: Props) {
  return <LessonPlayer draft={await load(params)} />;
}
