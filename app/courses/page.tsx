import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { coursesForUser } from "@/lib/cms";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/SignOut";
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q ?? "";
  const u = await currentUser();
  if (!u) redirect("/login");
  const courses = (await coursesForUser(u)).filter((c) =>
    `${c.title} ${c.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-teal-600">TeachCode</p>
          <h1 className="text-3xl font-bold">Course content</h1>
        </div>
        <div className="flex gap-2">
          {u.role === "admin" && (
            <Link className="btn-primary" href="/courses/new">
              New course
            </Link>
          )}
          <SignOut />
        </div>
      </header>
      <form className="mt-6 flex items-end gap-2">
        <label className="label flex-1">
          Search courses
          <input className="field" name="q" defaultValue={q} />
        </label>
        <button className="btn-secondary">Search</button>
      </form>
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/courses/${c.id}`}
            className="card p-5 hover:border-teal-600"
          >
            <span className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
              {c.status}
            </span>
            <h2 className="mt-3 text-lg font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {c.description || "No description yet"}
            </p>
            <p className="mt-4 text-xs text-zinc-500">
              {c.lesson_count} lessons · {c.slug}
            </p>
          </Link>
        ))}
      </section>
      {!courses.length && (
        <p className="mt-10 text-zinc-600">No courses are assigned to you.</p>
      )}
    </main>
  );
}
