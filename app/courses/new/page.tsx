import { createCourseAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function NewCourse() {
  if ((await requireUser()).role !== "admin") redirect("/courses");
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">Create course</h1>
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
