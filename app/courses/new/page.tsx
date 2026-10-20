import { createCourseAction } from "@/app/actions";
import { requireAuthor } from "@/lib/cms";
import Link from "next/link";

export default async function NewCourse() {
  await requireAuthor();

  return (
    <main className="mx-auto max-w-xl p-6">
      <p className="text-sm">
        <Link href="/courses" className="text-teal-800 hover:underline">
          ← Course content
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold">Create course</h1>
      <p className="mt-2 text-sm text-zinc-600">
        You own this course. An admin can assign another teacher from TeachCode.
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
        <button className="btn-primary mt-5">Create course</button>
      </form>
    </main>
  );
}
