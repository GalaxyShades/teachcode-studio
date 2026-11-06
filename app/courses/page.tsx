import Link from "next/link";
import { currentUser } from "@/lib/auth";
import {
  groupCoursesByOwner,
  listCoursesWithOwners,
  type ManagedCourseRow,
} from "@/lib/management-access";
import { redirect } from "next/navigation";
import { coursePath } from "@/lib/paths";

function statusBadgeClass(status: string): string {
  if (status === "published") {
    return "rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700";
  }
  if (status === "draft") {
    return "rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800";
  }
  return "rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600";
}

function CourseLink({ course, muted }: { course: ManagedCourseRow; muted?: boolean }) {
  return (
    <Link
      href={coursePath({ id: course.id, slug: course.slug })}
      className={`card p-6 transition hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-md ${
        muted ? "border-zinc-200 bg-zinc-50/80" : ""
      }`}
    >
      <span className={statusBadgeClass(course.status)}>{course.status}</span>
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

function CourseGrid({
  courses,
  muted,
}: {
  courses: ManagedCourseRow[];
  muted?: boolean;
}) {
  if (!courses.length) return null;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {courses.map((course) => (
        <CourseLink key={course.id} course={course} muted={muted} />
      ))}
    </div>
  );
}

function AdminCourseSection({
  courses,
  muted,
}: {
  courses: ManagedCourseRow[];
  muted?: boolean;
}) {
  const groups = groupCoursesByOwner(courses);
  if (!groups.length) return null;
  return (
    <div className="mt-4 space-y-8">
      {groups.map((group) => (
        <section key={group.heading}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-800">
            {group.heading}
          </h3>
          <CourseGrid courses={group.courses} muted={muted} />
        </section>
      ))}
    </div>
  );
}

function StatusSection({
  title,
  description,
  courses,
  isAdmin,
  muted,
}: {
  title: string;
  description: string;
  courses: ManagedCourseRow[];
  isAdmin: boolean;
  muted?: boolean;
}) {
  if (!courses.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">{description}</p>
      {isAdmin ? (
        <AdminCourseSection courses={courses} muted={muted} />
      ) : (
        <CourseGrid courses={courses} muted={muted} />
      )}
    </section>
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
  const published = courses.filter((course) => course.status === "published");
  const drafts = courses.filter((course) => course.status === "draft");
  const archived = courses.filter((course) => course.status === "archived");
  const isAdmin = u.role === "admin";

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
        </div>
      </header>
      <p className="mt-3 max-w-2xl text-zinc-600">
        {u.role === "admin"
          ? "Create and edit all courses here. Only published courses appear on TeachCode for learners."
          : "Create and edit your courses here. Publish when learners should see them on TeachCode."}
      </p>
      <form className="mt-6 flex items-end gap-2">
        <label className="label flex-1">
          Search courses
          <input className="field" name="q" defaultValue={q} />
        </label>
        <button className="btn-secondary">Search</button>
      </form>

      <StatusSection
        title="Published"
        description="Live on TeachCode. Learners and staff can open these courses from the Courses page."
        courses={published}
        isAdmin={isAdmin}
      />
      <StatusSection
        title="Draft"
        description="Work in progress. Drafts stay in Studio until you publish."
        courses={drafts}
        isAdmin={isAdmin}
        muted
      />
      <StatusSection
        title="Archived"
        description="Hidden from TeachCode. Restore to draft or published from course settings."
        courses={archived}
        isAdmin={isAdmin}
        muted
      />

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
