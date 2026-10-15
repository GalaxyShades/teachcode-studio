import { createCourseAction } from "@/app/actions";
import { requireAuthor } from "@/lib/cms";
import { db } from "@/lib/db";
import Link from "next/link";

export default async function NewCourse() {
  const user = await requireAuthor();
  const teachers = (
    await db().query<{ id: string; display_name: string; email: string }>(
      "SELECT id, display_name, email FROM profiles WHERE role='staff' ORDER BY display_name, email",
    )
  ).rows;

  return (
    <main className="mx-auto max-w-xl p-6">
      <p className="text-sm">
        <Link href="/courses" className="text-teal-800 hover:underline">
          ← Course content
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold">Create course</h1>
      <p className="mt-2 text-sm text-zinc-600">
        You own the course by default. Choose another teacher to own it instead;
        you keep access when you create it for someone else.
      </p>
      <form action={createCourseAction} className="card mt-6 p-6">
        <label className="label block">
          Course title
          <input name="title" className="field" required />
        </label>
        <label className="label mt-4 block">
          Slug
          <input name="slug" className="field" pattern="[a-z0-9-]+" required />
        </label>
        <label className="label mt-4 block">
          Description
          <textarea name="description" className="field" rows={4} />
        </label>
        <label className="label mt-4 block">
          Owner
          <select name="ownerId" className="field" defaultValue={user.id}>
            {user.role === "admin" ? (
              <option value={user.id}>
                Me (admin · sees all courses without an assignment)
              </option>
            ) : (
              <option value={user.id}>
                Me ({user.display_name || user.email})
              </option>
            )}
            {teachers
              .filter((teacher) => teacher.id !== user.id)
              .map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.display_name} · {teacher.email}
                </option>
              ))}
          </select>
        </label>
        <button className="btn-primary mt-5">Create course</button>
      </form>
    </main>
  );
}
