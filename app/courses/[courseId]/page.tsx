import Link from "next/link";
import { getCourse } from "@/lib/cms";
import { CourseManager } from "@/components/CourseManager";
import { resolveEditorCourse } from "@/lib/editor-routes";
import { coursePath } from "@/lib/paths";
import { redirect } from "next/navigation";
export default async function Course({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId: key } = await params;
  const resolved = await resolveEditorCourse(key);
  if (`/courses/${key}` !== coursePath(resolved))
    redirect(coursePath(resolved));
  const courseId = resolved.id;
  const { course, modules, lessons, staff, user } = await getCourse(courseId);
  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link href="/courses" className="text-teal-800 underline">
        ← Courses
      </Link>
      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{course.title}</h1>
          <p className="mt-2">{course.description}</p>
          <span className="text-sm">{course.status}</span>
        </div>
      </div>
      <CourseManager
        course={course as any}
        initialModules={modules as any}
        initialLessons={lessons as any}
        initialStaff={staff as any}
        admin={user.role === "admin"}
      />
    </main>
  );
}
