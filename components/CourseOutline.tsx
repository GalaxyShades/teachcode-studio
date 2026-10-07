"use client";

import {
  useId,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { lessonPath } from "@/lib/paths";

export type OutlineItem = { id: string; title: string; [key: string]: any };
const groupKey = (id: string | null) => `group:${id ?? "unassigned"}`;
function Surface({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  function canDrag(e: SyntheticEvent) {
    const target = e.target as Element;
    return (
      !disabled &&
      target.closest("[data-outline-item]") === e.currentTarget &&
      !target.closest(
        "button,a,input,textarea,select,label,summary,[data-no-drag]",
      )
    );
  }
  return (
    <div
      ref={setNodeRef}
      data-outline-item={id}
      data-dragging={isDragging || undefined}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px,${transform.y}px,0)`
          : undefined,
        transition,
      }}
      className={`relative rounded-xl ${disabled ? "" : "cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"} ${isDragging ? "z-20 bg-white opacity-70 shadow-xl" : ""}`}
      {...attributes}
      aria-disabled={undefined}
      role="group"
      aria-label={label}
      aria-roledescription={disabled ? undefined : "sortable card"}
      tabIndex={disabled ? -1 : 0}
      onMouseDown={(e) => {
        if (canDrag(e)) {
          e.stopPropagation();
          listeners?.onMouseDown?.(e);
        }
      }}
      onTouchStart={(e) => {
        if (canDrag(e)) {
          e.stopPropagation();
          listeners?.onTouchStart?.(e);
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && e.target === e.currentTarget) {
          e.stopPropagation();
          listeners?.onKeyDown?.(e);
        }
      }}
    >
      {children}
    </div>
  );
}
function LessonZone({
  id,
  disabled,
  children,
}: {
  id: string | null;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey(id), disabled });
  return (
    <div
      ref={setNodeRef}
      data-lesson-zone={id ?? "unassigned"}
      className={`min-h-16 rounded-xl p-2 transition-colors sm:p-3 ${isOver ? "bg-teal-50 ring-2 ring-teal-600" : "bg-zinc-50"}`}
    >
      {children}
    </div>
  );
}

export function CourseOutline({
  course,
  chapters,
  lessons,
  admin,
  busy,
  perform,
  refresh,
}: {
  course: OutlineItem;
  chapters: OutlineItem[];
  lessons: OutlineItem[];
  admin: boolean;
  busy: boolean;
  perform: (path: string, method: string, body: unknown) => Promise<boolean>;
  refresh: () => Promise<void>;
}) {
  const contextId = useId();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const lock = useRef(false);
  const [pending, setPending] = useState(false),
    [adding, setAdding] = useState<"chapter" | null>(null),
    [addingLesson, setAddingLesson] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const disabled = busy || pending || !admin || !ready;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) => {
        const parent = String(args.active).startsWith("chapter:");
        const droppableRects = new Map(
          [...args.context.droppableRects].filter(([id]) =>
            parent
              ? String(id).startsWith("chapter:")
              : !String(id).startsWith("chapter:"),
          ),
        );
        return sortableKeyboardCoordinates(event, {
          ...args,
          context: { ...args.context, droppableRects },
        });
      },
    }),
  );
  async function run(path: string, method: string, body: unknown) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    try {
      const ok = await perform(path, method, body);
      if (ok) await refresh();
      return ok;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const collision: CollisionDetection = (args) => {
    const parent = String(args.active.id).startsWith("chapter:");
    const candidates = args.droppableContainers.filter((c) =>
      parent
        ? String(c.id).startsWith("chapter:")
        : !String(c.id).startsWith("chapter:"),
    );
    const narrowed = { ...args, droppableContainers: candidates };
    const hits = pointerWithin(narrowed);
    if (hits.length)
      return [hits.find((h) => String(h.id).startsWith("lesson:")) ?? hits[0]];
    return args.pointerCoordinates ? [] : closestCenter(narrowed);
  };
  async function save(nextChapters: OutlineItem[], nextLessons: OutlineItem[]) {
    await run("/outline", "PUT", {
      chapters: nextChapters.map((chapter) => chapter.id),
      lessons: nextLessons.map((lesson) => ({
        id: lesson.id,
        chapterId: lesson.chapter_id ?? null,
      })),
    });
  }
  function lessonRows(chapterId: string | null) {
    const list = lessons.filter((lesson) => (lesson.chapter_id ?? null) === chapterId);
    return (
      <LessonZone id={chapterId} disabled={disabled}>
        <SortableContext
          items={list.map((lesson) => `lesson:${lesson.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {list.map((lesson, index) => (
              <Surface
                key={lesson.id}
                id={`lesson:${lesson.id}`}
                label={`Lesson ${index + 1}: ${lesson.title}`}
                disabled={disabled}
              >
                <article className="relative rounded-xl border bg-white p-4">
                  <div className="pr-24">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Lesson {index + 1}
                    </p>
                    <span className="absolute right-4 top-4 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                      {lesson.status}
                    </span>
                  </div>
                  <a
                    href={lessonPath(
                      { id: course.id, slug: course.slug },
                      { slug: lesson.slug },
                    )}
                    className="mt-2 inline-block font-semibold text-teal-900 hover:underline"
                  >
                    {lesson.title}
                  </a>
                  {lesson.status === "published" && (
                    <a
                      className="mt-2 block text-right text-sm text-teal-800 underline"
                      href={`/published/courses/${course.slug}/lessons/${lesson.published_slug ?? lesson.slug}`}
                    >
                      View public lesson
                    </a>
                  )}
                </article>
              </Surface>
            ))}
            {!list.length && (
              <p className="px-3 py-5 text-center text-sm text-zinc-600">
                {admin
                  ? "Drag a lesson here, or add one below."
                  : "No lessons yet."}
              </p>
            )}
          </div>
        </SortableContext>
      </LessonZone>
    );
  }
  return (
    <section className="mt-6" aria-labelledby="course-outline-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="course-outline-title" className="text-xl font-bold">
            Chapters & lessons
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            {admin
              ? "Drag cards to reorder or move lessons between chapters."
              : "Choose a lesson to open its content."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
            {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
          </span>
          {admin && (
            <details className="max-w-xs">
              <summary className="cursor-pointer text-teal-800">
                Reordering help
              </summary>
              <p className="mt-2 rounded-lg border bg-white p-3">
                Drag a card to move it. On touch screens, press and hold first.
                For keyboard controls, focus a card, press Space, use the arrow
                keys, then press Space to drop. Escape cancels.
              </p>
            </details>
          )}
        </div>
      </div>
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={collision}
        onDragEnd={({ active, over }) => {
          if (disabled || !over || active.id === over.id) return;
          const from = String(active.id),
            to = String(over.id);
          if (from.startsWith("chapter:") && to.startsWith("chapter:")) {
            void save(
              arrayMove(
                chapters,
                chapters.findIndex((chapter) => `chapter:${chapter.id}` === from),
                chapters.findIndex((chapter) => `chapter:${chapter.id}` === to),
              ),
              lessons,
            );
            return;
          }
          const moved = lessons.find((lesson) => `lesson:${lesson.id}` === from);
          if (!moved) return;
          const target = lessons.find((lesson) => `lesson:${lesson.id}` === to);
          const chapterId = target
            ? (target.chapter_id ?? null)
            : to === groupKey(null)
              ? null
              : chapters.find((chapter) => groupKey(chapter.id) === to)?.id;
          if (chapterId === undefined) return;
          const next = lessons.filter((lesson) => lesson.id !== moved.id);
          const index = target
            ? next.findIndex((lesson) => lesson.id === target.id) +
              ((moved.chapter_id ?? null) === chapterId &&
              lessons.indexOf(moved) < lessons.indexOf(target)
                ? 1
                : 0)
            : next.length;
          next.splice(index, 0, { ...moved, chapter_id: chapterId });
          void save(chapters, next);
        }}
      >
        <SortableContext
          items={chapters.map((chapter) => `chapter:${chapter.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {chapters.map((chapter, index) => (
              <Surface
                key={chapter.id}
                id={`chapter:${chapter.id}`}
                label={`Chapter ${index + 1}: ${chapter.title}`}
                disabled={disabled}
              >
                <article className="card">
                  <header
                    data-chapter-surface
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">
                        Chapter {index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">{chapter.title}</h3>
                    </div>
                    {admin && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={disabled}
                        onClick={() =>
                          setEditing(editing === chapter.id ? null : chapter.id)
                        }
                      >
                        {editing === chapter.id ? "Done" : "Edit chapter"}
                      </button>
                    )}
                  </header>
                  {editing === chapter.id && (
                    <form
                      className="mx-5 mb-4 flex flex-wrap items-end gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const title = String(
                          new FormData(e.currentTarget).get("title"),
                        );
                        if (
                          await run("/chapters", "POST", {
                            id: chapter.id,
                            title,
                          })
                        )
                          setEditing(null);
                      }}
                    >
                      <label className="label min-w-0 flex-1">
                        Chapter title
                        <input
                          className="field"
                          name="title"
                          defaultValue={chapter.title}
                          required
                          disabled={disabled}
                        />
                      </label>
                      <button className="btn-primary" disabled={disabled}>
                        Save title
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-red-700"
                        disabled={
                          disabled ||
                          lessons.some((lesson) => lesson.chapter_id === chapter.id)
                        }
                        onClick={async () => {
                          if (
                            window.confirm("Delete this empty chapter?") &&
                            (await run("/chapters", "DELETE", { id: chapter.id }))
                          )
                            setEditing(null);
                        }}
                      >
                        Delete chapter
                      </button>
                    </form>
                  )}
                  <div className="px-3 pb-3 sm:px-5 sm:pb-5">
                    {lessonRows(chapter.id)}
                    {admin && (
                      <div className="mt-3" data-no-drag>
                        {addingLesson === chapter.id ? (
                          <form
                            className="flex flex-wrap items-end gap-2"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const input = e.currentTarget.elements.namedItem(
                                "title",
                              ) as HTMLInputElement;
                              const title = input.value.trim();
                              if (!title) {
                                input.setCustomValidity("Enter a lesson name.");
                                input.reportValidity();
                                return;
                              }
                              if (
                                await run("/lessons", "POST", {
                                  chapterId: chapter.id,
                                  title,
                                })
                              )
                                setAddingLesson(null);
                            }}
                          >
                            <label className="label min-w-0 flex-1">
                              Lesson name
                              <input
                                autoFocus
                                className="field"
                                name="title"
                                placeholder="e.g. Your first program"
                                required
                                maxLength={200}
                                disabled={disabled}
                                onInput={(e) =>
                                  e.currentTarget.setCustomValidity("")
                                }
                              />
                            </label>
                            <button className="btn-primary" disabled={disabled}>
                              Create lesson
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={disabled}
                              onClick={() => setAddingLesson(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <span className="text-sm text-zinc-500">
                              {
                                lessons.filter(
                                  (lesson) => lesson.chapter_id === chapter.id,
                                ).length
                              }{" "}
                              {lessons.filter(
                                (lesson) => lesson.chapter_id === chapter.id,
                              ).length === 1
                                ? "lesson"
                                : "lessons"}
                            </span>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={disabled}
                              onClick={() => setAddingLesson(chapter.id)}
                            >
                              ＋ Add lesson
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              </Surface>
            ))}
          </div>
        </SortableContext>
        {lessons.some((lesson) => !lesson.chapter_id) && (
          <section className="card mt-4 p-5">
            <h3 className="mb-3 font-semibold">Lessons without a chapter</h3>
            {lessonRows(null)}
          </section>
        )}
      </DndContext>
      {!chapters.length && !lessons.length && (
        <div className="card p-8 text-center">
          <h3 className="font-semibold">Start your course outline</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Add your first chapter, then create its lessons.
          </p>
        </div>
      )}
      {admin && (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
          <div className="flex justify-center">
            <button
              className="btn-primary min-h-14 w-full px-8 py-4 text-base sm:w-auto sm:min-w-64"
              disabled={disabled}
              onClick={() => setAdding(adding === "chapter" ? null : "chapter")}
            >
              ＋ Add chapter
            </button>
          </div>
          {adding === "chapter" && (
            <form
              className="mt-4 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const title = String(
                  new FormData(e.currentTarget).get("title"),
                );
                if (await run("/chapters", "POST", { title })) setAdding(null);
              }}
            >
              <label className="label min-w-0 flex-1">
                New chapter title
                <input
                  autoFocus
                  className="field"
                  name="title"
                  placeholder="e.g. Working with data"
                  required
                  disabled={disabled}
                />
              </label>
              <button className="btn-primary" disabled={disabled}>
                Create chapter
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
