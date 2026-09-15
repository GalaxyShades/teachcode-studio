import Link from "next/link";
import { getCourse } from "@/lib/cms";
import { CourseSettings } from "@/components/CourseSettings";
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
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link href="/courses" className="text-teal-800 underline">
        ← Courses
      </Link>
      <header className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b pb-6">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <h1 className="break-words text-3xl font-bold">{course.title}</h1>
          <p className="mt-2 max-w-2xl break-words text-zinc-600">
            {course.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-sm font-medium capitalize text-teal-800">
            {course.status}
          </span>
          {user.role === "admin" && <CourseSettings course={course as any} />}
        </div>
      </header>
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
