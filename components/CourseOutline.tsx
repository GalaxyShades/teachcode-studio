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
  DragOverlay,
  MeasuringStrategy,
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
import * as Dialog from "@radix-ui/react-dialog";
import { lessonPath } from "@/lib/paths";

export type OutlineItem = { id: string; title: string; [key: string]: any };
const groupKey = (id: string | null) => `group:${id ?? "unassigned"}`;

function chapterForOver(
  overId: string,
  lessons: OutlineItem[],
  chapters: OutlineItem[],
) {
  if (overId.startsWith("lesson:")) {
    const lesson = lessons.find((item) => `lesson:${item.id}` === overId);
    return lesson ? (lesson.chapter_id ?? null) : undefined;
  }
  if (overId.startsWith("chapter:")) {
    const id = overId.slice("chapter:".length);
    return chapters.some((chapter) => chapter.id === id) ? id : undefined;
  }
  if (overId === groupKey(null)) return null;
  if (overId.startsWith("group:")) {
    const id = overId.slice("group:".length);
    return chapters.some((chapter) => chapter.id === id) ? id : undefined;
  }
  return undefined;
}

function placeLesson(
  lessons: OutlineItem[],
  chapters: OutlineItem[],
  activeId: string,
  overId: string,
) {
  if (activeId === overId) return lessons;
  const moved = lessons.find((lesson) => `lesson:${lesson.id}` === activeId);
  if (!moved) return null;
  const chapterId = chapterForOver(overId, lessons, chapters);
  if (chapterId === undefined) return null;
  const target = lessons.find((lesson) => `lesson:${lesson.id}` === overId);
  const next = lessons.filter((lesson) => lesson.id !== moved.id);
  let index = next.length;
  if (target && target.id !== moved.id) {
    index = next.findIndex((lesson) => lesson.id === target.id);
    if (
      (moved.chapter_id ?? null) === chapterId &&
      lessons.indexOf(moved) < lessons.indexOf(target)
    )
      index += 1;
  } else {
    let last = -1;
    next.forEach((lesson, position) => {
      if ((lesson.chapter_id ?? null) === chapterId) last = position;
    });
    index = last === -1 ? next.length : last + 1;
  }
  next.splice(index, 0, { ...moved, chapter_id: chapterId });
  return next;
}

function sameLessons(a: OutlineItem[], b: OutlineItem[]) {
  return (
    a.length === b.length &&
    a.every(
      (lesson, index) =>
        lesson.id === b[index]?.id &&
        (lesson.chapter_id ?? null) === (b[index]?.chapter_id ?? null),
    )
  );
}

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
    isOver,
  } = useSortable({ id, disabled });
  const press = useRef<{ x: number; y: number } | null>(null);
  const lesson = id.startsWith("lesson:");
  // The lesson title is a link. A still press opens it; a press that moves
  // on the rest of the card drags it. Buttons and [data-no-drag] stay click-only.
  function canDrag(e: SyntheticEvent) {
    const target = e.target as Element;
    return (
      !disabled &&
      target.closest("[data-outline-item]") === e.currentTarget &&
      !target.closest(
        "button,input,textarea,select,label,summary,a,[data-no-drag]",
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
        transition: isDragging ? undefined : transition,
      }}
      className={`relative rounded-xl ${disabled ? "" : "cursor-grab select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"} ${isDragging && lesson ? "pointer-events-none opacity-0" : ""} ${isDragging && !lesson ? "z-20 bg-white opacity-70 shadow-xl" : ""} ${isOver && !isDragging ? "ring-2 ring-teal-600" : ""}`}
      {...attributes}
      aria-disabled={undefined}
      role="group"
      aria-label={label}
      aria-roledescription={disabled ? undefined : "sortable card"}
      tabIndex={disabled ? -1 : 0}
      onDragStart={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (!canDrag(e)) return;
        press.current = { x: e.clientX, y: e.clientY };
        e.stopPropagation();
        listeners?.onMouseDown?.(e);
      }}
      onTouchStart={(e) => {
        if (!canDrag(e)) return;
        const touch = e.changedTouches[0];
        if (touch) press.current = { x: touch.clientX, y: touch.clientY };
        e.stopPropagation();
        listeners?.onTouchStart?.(e);
      }}
      onClickCapture={(e) => {
        const start = press.current;
        press.current = null;
        if (
          start &&
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4
        ) {
          e.preventDefault();
          e.stopPropagation();
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
  hot,
  children,
}: {
  id: string | null;
  disabled: boolean;
  hot: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey(id), disabled });
  return (
    <div
      ref={setNodeRef}
      data-lesson-zone={id ?? "unassigned"}
      className={`min-h-16 rounded-xl p-2 transition-colors sm:p-3 ${isOver || hot ? "bg-teal-50 ring-2 ring-teal-600" : "bg-zinc-50"}`}
    >
      {children}
    </div>
  );
}

function LessonFace({
  course,
  lesson,
  index,
  lifted,
}: {
  course: OutlineItem;
  lesson: OutlineItem;
  index: number;
  lifted?: boolean;
}) {
  return (
    <article
      className={`relative h-full rounded-xl border bg-white p-4 ${lifted ? "cursor-grabbing shadow-2xl ring-2 ring-teal-700" : ""}`}
    >
      <div className="pr-24">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Lesson {index + 1}
        </p>
        <span className="absolute right-4 top-4 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
          {lesson.status}
        </span>
      </div>
      {lifted || !lesson.slug ? (
        <p className="mt-2 font-semibold text-teal-900">{lesson.title}</p>
      ) : (
        <a
          href={lessonPath(
            { id: course.id, slug: course.slug },
            { slug: lesson.slug },
          )}
          draggable={false}
          data-no-drag
          className="mt-2 inline-block cursor-pointer font-semibold text-teal-900 hover:underline"
        >
          {lesson.title}
        </a>
      )}
      {!lifted && lesson.status === "published" && (
        <a
          draggable={false}
          data-no-drag
          className="mt-2 block text-right text-sm text-teal-800 underline"
          href={`/published/courses/${course.slug}/lessons/${lesson.published_slug ?? lesson.slug}`}
        >
          View public lesson
        </a>
      )}
    </article>
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
  applyOutline,
  createChapter,
  createLesson,
  setDragging,
}: {
  course: OutlineItem;
  chapters: OutlineItem[];
  lessons: OutlineItem[];
  admin: boolean;
  busy: boolean;
  perform: (path: string, method: string, body: unknown) => Promise<boolean>;
  refresh: () => Promise<void>;
  applyOutline: (
    chapters: OutlineItem[],
    lessons: OutlineItem[],
    save: boolean,
  ) => void;
  createChapter: (title: string) => void;
  createLesson: (chapterId: string, title: string) => void;
  setDragging: (active: boolean) => void;
}) {
  const contextId = useId();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const lock = useRef(false);
  const [pending, setPending] = useState(false),
    [chapterOpen, setChapterOpen] = useState(false),
    [addingLesson, setAddingLesson] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [liftedId, setLiftedId] = useState<string | null>(null),
    [hover, setHover] = useState<string | null | undefined>(undefined);
  const dragDisabled = !admin || !ready;
  const formLocked = busy || pending;
  const lessonsRef = useRef(lessons);
  const chaptersRef = useRef(chapters);
  lessonsRef.current = lessons;
  chaptersRef.current = chapters;
  const snapshot = useRef<{ chapters: OutlineItem[]; lessons: OutlineItem[] } | null>(
    null,
  );
  const justMoved = useRef(false);
  useEffect(() => {
    if (!justMoved.current) return;
    const frame = requestAnimationFrame(() => {
      justMoved.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [lessons]);
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
    const draggingChapter = String(args.active.id).startsWith("chapter:");
    const candidates = args.droppableContainers.filter((c) => {
      if (c.id === args.active.id) return false;
      return draggingChapter
        ? String(c.id).startsWith("chapter:")
        : !String(c.id).startsWith("chapter:");
    });
    const narrowed = { ...args, droppableContainers: candidates };
    const hits = pointerWithin(narrowed);
    if (hits.length)
      return [hits.find((h) => String(h.id).startsWith("lesson:")) ?? hits[0]];
    // Chapter cards are also lesson drop targets. Their rects wrap each
    // lesson list, so they are only used when the pointer is on the card
    // itself (the header or footer) and not on a lesson or list zone.
    if (!draggingChapter && args.pointerCoordinates) {
      const chapterHits = pointerWithin({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          String(c.id).startsWith("chapter:"),
        ),
      });
      if (chapterHits.length) return [chapterHits[0]];
    }
    return args.pointerCoordinates ? [] : closestCenter(narrowed);
  };
  function finishDrag() {
    setLiftedId(null);
    setHover(undefined);
    setDragging(false);
    snapshot.current = null;
  }
  function restore() {
    const saved = snapshot.current;
    if (saved) applyOutline(saved.chapters, saved.lessons, false);
  }
  const lifted = lessons.find((lesson) => lesson.id === liftedId) ?? null;
  const liftedIndex = lifted
    ? lessons
        .filter(
          (lesson) => (lesson.chapter_id ?? null) === (lifted.chapter_id ?? null),
        )
        .findIndex((lesson) => lesson.id === lifted.id)
    : -1;
  function lessonRows(chapterId: string | null) {
    const list = lessons.filter(
      (lesson) => (lesson.chapter_id ?? null) === chapterId,
    );
    return (
      <LessonZone
        id={chapterId}
        disabled={dragDisabled}
        hot={lifted !== null && hover === chapterId}
      >
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
                disabled={dragDisabled}
              >
                <LessonFace course={course} lesson={lesson} index={index} />
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
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always },
        }}
        onDragStart={({ active }) => {
          snapshot.current = {
            chapters: chaptersRef.current.map((chapter) => ({ ...chapter })),
            lessons: lessonsRef.current.map((lesson) => ({ ...lesson })),
          };
          setDragging(true);
          const id = String(active.id);
          setLiftedId(id.startsWith("lesson:") ? id.slice("lesson:".length) : null);
        }}
        onDragOver={({ active, over }) => {
          const from = String(active.id);
          if (!from.startsWith("lesson:") || !over) {
            setHover(undefined);
            return;
          }
          const overId = String(over.id);
          const chapterId = chapterForOver(
            overId,
            lessonsRef.current,
            chaptersRef.current,
          );
          setHover(chapterId);
          if (chapterId === undefined || justMoved.current) return;
          const moved = lessonsRef.current.find(
            (lesson) => `lesson:${lesson.id}` === from,
          );
          if (!moved || (moved.chapter_id ?? null) === chapterId) return;
          const next = placeLesson(
            lessonsRef.current,
            chaptersRef.current,
            from,
            overId,
          );
          if (!next) return;
          justMoved.current = true;
          lessonsRef.current = next;
          applyOutline(chaptersRef.current, next, false);
        }}
        onDragCancel={() => {
          restore();
          finishDrag();
        }}
        onDragEnd={({ active, over }) => {
          const from = String(active.id);
          const saved = snapshot.current;
          if (!over || !saved) {
            restore();
            finishDrag();
            return;
          }
          const to = String(over.id);
          if (from.startsWith("chapter:") && to.startsWith("chapter:")) {
            if (from === to) {
              finishDrag();
              return;
            }
            const nextChapters = arrayMove(
              chaptersRef.current,
              chaptersRef.current.findIndex(
                (chapter) => `chapter:${chapter.id}` === from,
              ),
              chaptersRef.current.findIndex(
                (chapter) => `chapter:${chapter.id}` === to,
              ),
            );
            applyOutline(nextChapters, lessonsRef.current, true);
            finishDrag();
            return;
          }
          const next = placeLesson(
            lessonsRef.current,
            chaptersRef.current,
            from,
            to,
          );
          if (!next) {
            restore();
            finishDrag();
            return;
          }
          applyOutline(
            chaptersRef.current,
            next,
            !sameLessons(saved.lessons, next),
          );
          finishDrag();
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
                disabled={dragDisabled}
              >
                <article
                  className={`card ${hover === chapter.id && lifted ? "ring-2 ring-teal-600" : ""}`}
                >
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
                        disabled={formLocked}
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
                          disabled={formLocked}
                        />
                      </label>
                      <button className="btn-primary" disabled={formLocked}>
                        Save title
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-red-700"
                        disabled={
                          formLocked ||
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
                            onSubmit={(e) => {
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
                              setAddingLesson(null);
                              createLesson(chapter.id, title);
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
                                onInput={(e) =>
                                  e.currentTarget.setCustomValidity("")
                                }
                              />
                            </label>
                            <button className="btn-primary">Create lesson</button>
                            <button
                              type="button"
                              className="btn-secondary"
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
        {(lessons.some((lesson) => !lesson.chapter_id) ||
          (lifted !== null && hover === null)) && (
          <section
            className={`card mt-4 p-5 ${hover === null && lifted ? "ring-2 ring-teal-600" : ""}`}
          >
            <h3 className="mb-3 font-semibold">Lessons without a chapter</h3>
            {lessonRows(null)}
          </section>
        )}
        {lifted && (
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
            <LessonFace
              course={course}
              lesson={lifted}
              index={Math.max(liftedIndex, 0)}
              lifted
            />
          </DragOverlay>
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
        <Dialog.Root open={chapterOpen} onOpenChange={setChapterOpen}>
          <button
            type="button"
            className="btn-primary mx-auto mt-4 flex min-h-14 w-full px-8 py-4 text-base sm:w-auto sm:min-w-64"
            onClick={() => setChapterOpen(true)}
          >
            ＋ Add chapter
          </button>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-xl">
              <Dialog.Title className="text-lg font-bold">Add chapter</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-600">
                The chapter appears in the outline as soon as you confirm.
              </Dialog.Description>
              <form
                className="mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.elements.namedItem(
                    "title",
                  ) as HTMLInputElement;
                  const title = input.value.trim();
                  if (!title) {
                    input.setCustomValidity("Enter a chapter title.");
                    input.reportValidity();
                    return;
                  }
                  setChapterOpen(false);
                  createChapter(title);
                }}
              >
                <label className="label block">
                  New chapter title
                  <input
                    autoFocus
                    className="field"
                    name="title"
                    placeholder="e.g. Working with data"
                    required
                    onInput={(e) => e.currentTarget.setCustomValidity("")}
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button type="button" className="btn-secondary">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button className="btn-primary">Create chapter</button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  );
}
