import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { groupCoursesByOwner, listCoursesWithOwners } from "@/lib/management-access";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/SignOut";
import { coursePath } from "@/lib/paths";

type CourseCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  lessonCount: number;
};

function CourseLink({ course }: { course: CourseCard }) {
  return (
    <Link
      href={coursePath({ id: course.id, slug: course.slug })}
      className="card p-6 transition hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-md"
    >
      <span className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
        {course.status}
      </span>
      <h3 className="mt-3 text-lg font-semibold">{course.title}</h3>
      <p className="mt-1 text-sm text-zinc-600">
        {course.description || "No description yet"}
      </p>
      <p className="mt-4 text-xs text-zinc-500">
        {course.lessonCount} lessons · {course.slug}
      </p>
    </Link>
  );
}

export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q ?? "";
  const u = await currentUser();
  if (!u) redirect("/login");
  const needle = q.toLowerCase();
  const courses = (await listCoursesWithOwners(u)).filter((course) =>
    `${course.title} ${course.description} ${course.ownerName} ${course.ownerEmail}`
      .toLowerCase()
      .includes(needle),
  );
  const ownerGroups = u.role === "admin" ? groupCoursesByOwner(courses) : null;
  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">
            TeachCode Studio
          </p>
          <h1 className="text-3xl font-bold">Course content</h1>
        </div>
        <div className="flex gap-2">
          {["admin", "staff"].includes(u.role) && (
            <Link className="btn-primary" href="/courses/new">
              New course
            </Link>
          )}
          <SignOut />
        </div>
      </header>
      <p className="mt-3 max-w-2xl text-zinc-600">
        {u.role === "admin"
          ? "Every course is listed under the teacher who owns it. Create lessons, then publish them for TeachCode."
          : "Teachers see courses they created or were assigned. Create lessons, then publish them for TeachCode."}
      </p>
      <form className="mt-6 flex items-end gap-2">
        <label className="label flex-1">
          Search courses
          <input className="field" name="q" defaultValue={q} />
        </label>
        <button className="btn-secondary">Search</button>
      </form>
      {ownerGroups ? (
        <div className="mt-8 space-y-10">
          {ownerGroups.map((group) => (
            <section key={group.heading}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-800">
                {group.heading}
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.courses.map((course) => (
                  <CourseLink key={course.id} course={course} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <CourseLink key={course.id} course={course} />
          ))}
        </section>
      )}
      {!courses.length && (
        <p className="mt-10 text-zinc-600">
          {q
            ? "No courses match your search. Try another keyword or clear the search."
            : "No courses are assigned to you."}
        </p>
      )}
    </main>
  );
}
