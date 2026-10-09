"use client";
import { useState } from "react";

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
};

export function CoursePublish({
  course,
  admin,
}: {
  course: Course;
  admin: boolean;
}) {
  const [status, setStatus] = useState(course.status),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function update(next: "published" | "draft") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: course.title,
          slug: course.slug,
          description: course.description,
          status: next,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not update the course");
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the course");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-sm font-medium capitalize text-teal-800">
        {status}
      </span>
      {admin && (
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => update("published")}
        >
          Publish
        </button>
      )}
      {admin && status === "published" && (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => update("draft")}
        >
          Unpublish
        </button>
      )}
      {error && (
        <p role="status" className="basis-full text-right text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
