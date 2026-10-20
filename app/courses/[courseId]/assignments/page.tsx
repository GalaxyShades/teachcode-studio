import { resolveEditorCourse } from "@/lib/editor-routes";
import { coursePath } from "@/lib/paths";
import { redirect } from "next/navigation";

/** Assignment lives on the TeachCode admin dashboard. */
export default async function Assignments({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId: key } = await params;
  const resolved = await resolveEditorCourse(key);
  redirect(coursePath(resolved));
}
