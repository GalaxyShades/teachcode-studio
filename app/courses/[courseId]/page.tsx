import Link from "next/link";
import { getCourse } from "@/lib/cms";
import { CourseSettings } from "@/components/CourseSettings";
import { CoursePublish } from "@/components/CoursePublish";
import { CourseManager } from "@/components/CourseManager";
import { resolveEditorCourse } from "@/lib/editor-routes";
import { assignmentsPath, coursePath, generateLessonPath } from "@/lib/paths";
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
  const { course, chapters, lessons, user } = await getCourse(courseId);
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
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <CoursePublish
            course={course as any}
            admin={user.role === "admin"}
          />
          {user.role === "admin" && (
            <Link href={assignmentsPath(resolved)} className="btn-secondary">
              Staff assignments
            </Link>
          )}
          {user.role === "admin" && <CourseSettings course={course as any} />}
        </div>
      </header>
      <Link
        href={generateLessonPath(resolved)}
        className="btn-primary mt-6"
      >
        Create lesson with AI
      </Link>
      <CourseManager
        course={course as any}
        initialChapters={chapters as any}
        initialLessons={lessons as any}
        admin={user.role === "admin"}
      />
    </main>
  );
}
