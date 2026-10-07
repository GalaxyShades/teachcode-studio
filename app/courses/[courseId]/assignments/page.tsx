import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse } from "@/lib/cms";
import { StaffAssignments } from "@/components/StaffAssignments";
import { resolveEditorCourse } from "@/lib/editor-routes";
import { assignmentsPath, coursePath } from "@/lib/paths";
import { redirect } from "next/navigation";
export default async function Assignments({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId: key } = await params;
  const resolved = await resolveEditorCourse(key);
  const path = assignmentsPath(resolved);
  if (`/courses/${key}/assignments` !== path) redirect(path);
  const { course, staff, user } = await getCourse(resolved.id);
  if (user.role !== "admin") notFound();
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href={coursePath(resolved)} className="text-teal-800 underline">
        ← {course.title}
      </Link>
      <header className="mt-5 border-b pb-6">
        <h1 className="text-3xl font-bold">Staff assignments</h1>
        <p className="mt-2 text-zinc-600">
          Choose who can edit drafts in {course.title}.
        </p>
      </header>
      <StaffAssignments courseId={course.id} initialStaff={staff as any} />
    </main>
  );
}
