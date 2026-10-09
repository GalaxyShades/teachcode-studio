"use client";
import { useRef, useState } from "react";
import { CourseOutline, type OutlineItem } from "./CourseOutline";
type Item = OutlineItem;
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
    [statusError, setStatusError] = useState(false),
    [busy, setBusy] = useState(false);
  const base = `/api/courses/${course.id}`;
  const chaptersRef = useRef(initialChapters);
  const lessonsRef = useRef(initialLessons);
  const dragging = useRef(false);
  const saveGen = useRef(0);
  const tail = useRef(Promise.resolve());
  function show(message: string, error: boolean) {
    setStatus(message);
    setStatusError(error);
  }
  function remember(nextChapters: Item[], nextLessons: Item[]) {
    chaptersRef.current = nextChapters;
    lessonsRef.current = nextLessons;
    setChapters(nextChapters);
    setLessons(nextLessons);
  }
  function enqueue(task: () => Promise<void>) {
    const run = tail.current.then(task, task);
    tail.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  function syncOutline() {
    const gen = ++saveGen.current;
    enqueue(async () => {
      if (gen !== saveGen.current) return;
      try {
        const res = await fetch(base + "/outline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapters: chaptersRef.current.map((chapter) => chapter.id),
            lessons: lessonsRef.current.map((lesson) => ({
              id: lesson.id,
              chapterId: lesson.chapter_id ?? null,
            })),
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (gen !== saveGen.current) return;
        if (!res.ok)
          throw new Error(result.error || "Could not sync the outline");
        show("", false);
      } catch (e) {
        if (gen !== saveGen.current) return;
        show(
          e instanceof Error ? e.message : "Could not sync the outline",
          true,
        );
      }
    });
  }
  function applyOutline(
    nextChapters: Item[],
    nextLessons: Item[],
    save: boolean,
  ) {
    remember(nextChapters, nextLessons);
    if (save) syncOutline();
  }
  function createChapter(title: string) {
    const id = crypto.randomUUID();
    remember(
      [...chaptersRef.current, { id, title }],
      lessonsRef.current,
    );
    enqueue(async () => {
      try {
        const res = await fetch(base + "/chapters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ create: true, id, title }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(result.error || "Could not add the chapter");
        show("", false);
      } catch (e) {
        remember(
          chaptersRef.current.filter((chapter) => chapter.id !== id),
          lessonsRef.current.map((lesson) =>
            lesson.chapter_id === id ? { ...lesson, chapter_id: null } : lesson,
          ),
        );
        show(e instanceof Error ? e.message : "Could not add the chapter", true);
      }
    });
  }
  function createLesson(chapterId: string, title: string) {
    const id = crypto.randomUUID();
    const name = title.trim();
    remember(chaptersRef.current, [
      ...lessonsRef.current,
      { id, title: name, slug: "", status: "draft", chapter_id: chapterId },
    ]);
    enqueue(async () => {
      try {
        const res = await fetch(base + "/lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId, title: name, id }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(result.error || "Could not add the lesson");
        remember(
          chaptersRef.current,
          lessonsRef.current.map((lesson) =>
            lesson.id === id
              ? {
                  ...lesson,
                  slug: result.slug ?? lesson.slug,
                  status: result.status ?? lesson.status,
                  title: result.title ?? lesson.title,
                }
              : lesson,
          ),
        );
        show("", false);
        syncOutline();
      } catch (e) {
        remember(
          chaptersRef.current,
          lessonsRef.current.filter((lesson) => lesson.id !== id),
        );
        show(e instanceof Error ? e.message : "Could not add the lesson", true);
      }
    });
  }
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
      show("Saved", false);
      return true;
    } catch (e) {
      show(e instanceof Error ? e.message : "Request failed", true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const seen = saveGen.current;
    try {
      const r = await fetch(base);
      if (!r.ok)
        throw new Error(
          "Could not reload the outline. Refresh the page to see the latest saved content.",
        );
      const c = await r.json();
      if (dragging.current || seen !== saveGen.current) return;
      remember(c.chapters, c.lessons);
    } catch (e) {
      show(
        e instanceof Error
          ? e.message
          : "Could not reload the outline. Refresh the page.",
        true,
      );
    }
  }
  return (
    <>
      <p
        role="status"
        className={`text-right text-sm ${status ? "my-3" : "my-0"} ${statusError ? "text-red-700" : "text-zinc-600"}`}
      >
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
        applyOutline={applyOutline}
        createChapter={createChapter}
        createLesson={createLesson}
        setDragging={(active) => {
          dragging.current = active;
        }}
      />
    </>
  );
}
