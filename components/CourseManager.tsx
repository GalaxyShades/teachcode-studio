"use client";
import { useState } from "react";
import { CourseOutline } from "./CourseOutline";
type Item = { id: string; title: string; [key: string]: any };
export function CourseManager({
  course,
  initialChapters,
  initialLessons,
  admin,
}: {
  course: Item;
  initialChapters: Item[];
  initialLessons: Item[];
  admin: boolean;
}) {
  const [chapters, setChapters] = useState(initialChapters),
    [lessons, setLessons] = useState(initialLessons),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const base = `/api/courses/${course.id}`;
  async function request(path: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setStatus("Saved");
      return true;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    try {
      const r = await fetch(base);
      if (!r.ok)
        throw new Error(
          "Could not reload the outline. Refresh the page to see the latest saved content.",
        );
      const c = await r.json();
      setChapters(c.chapters);
      setLessons(c.lessons);
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not reload the outline. Refresh the page.",
      );
    }
  }
  return (
    <>
      <p role="status" className="my-3 text-right text-sm empty:my-0">
        {status}
      </p>
      <CourseOutline
        course={course}
        chapters={chapters}
        lessons={lessons}
        admin={admin}
        busy={busy}
        perform={request}
        refresh={refresh}
      />
    </>
  );
}
