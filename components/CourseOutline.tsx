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
function ChapterZone({
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
      data-chapter-zone={id ?? "unassigned"}
      className={`min-h-16 rounded-xl p-2 transition-colors sm:p-3 ${isOver ? "bg-teal-50 ring-2 ring-teal-600" : "bg-zinc-50"}`}
    >
      {children}
    </div>
  );
}

export function CourseOutline({
  course,
  modules,
  chapters,
  admin,
  busy,
  perform,
  refresh,
}: {
  course: OutlineItem;
  modules: OutlineItem[];
  chapters: OutlineItem[];
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
    [adding, setAdding] = useState<"lesson" | "chapter" | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const disabled = busy || pending || !admin || !ready;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) => {
        const parent = String(args.active).startsWith("lesson:");
        const droppableRects = new Map(
          [...args.context.droppableRects].filter(([id]) =>
            parent
              ? String(id).startsWith("lesson:")
              : !String(id).startsWith("lesson:"),
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
    const parent = String(args.active.id).startsWith("lesson:");
    const candidates = args.droppableContainers.filter((c) =>
      parent
        ? String(c.id).startsWith("lesson:")
        : !String(c.id).startsWith("lesson:"),
    );
    const narrowed = { ...args, droppableContainers: candidates };
    const hits = pointerWithin(narrowed);
    if (hits.length)
      return [hits.find((h) => String(h.id).startsWith("chapter:")) ?? hits[0]];
    return args.pointerCoordinates ? [] : closestCenter(narrowed);
  };
  async function save(nextModules: OutlineItem[], nextChapters: OutlineItem[]) {
    await run("/outline", "PUT", {
      lessons: nextModules.map((m) => m.id),
      chapters: nextChapters.map((ch) => ({
        id: ch.id,
        lessonId: ch.module_id ?? null,
      })),
    });
  }
  function chapterRows(moduleId: string | null) {
    const list = chapters.filter((ch) => (ch.module_id ?? null) === moduleId);
    return (
      <ChapterZone id={moduleId} disabled={disabled}>
        <SortableContext
          items={list.map((ch) => `chapter:${ch.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {list.map((ch, index) => (
              <Surface
                key={ch.id}
                id={`chapter:${ch.id}`}
                label={`Chapter ${index + 1}: ${ch.title}`}
                disabled={disabled}
              >
                <article className="rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Chapter {index + 1}
                    </p>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                      {ch.status}
                    </span>
                  </div>
                  <a
                    href={lessonPath(
                      { id: course.id, slug: course.slug },
                      { slug: ch.slug },
                    )}
                    className="mt-2 inline-block font-semibold text-teal-900 hover:underline"
                  >
                    {ch.title}
                  </a>
                  {ch.status === "published" && (
                    <a
                      className="mt-2 block text-sm text-teal-800 underline"
                      href={`/published/courses/${course.slug}/lessons/${ch.published_slug ?? ch.slug}`}
                    >
                      View public chapter
                    </a>
                  )}
                </article>
              </Surface>
            ))}
            {!list.length && (
              <p className="px-3 py-5 text-center text-sm text-zinc-600">
                {admin
                  ? "Drag a chapter here, or add one below."
                  : "No chapters yet."}
              </p>
            )}
          </div>
        </SortableContext>
      </ChapterZone>
    );
  }
  return (
    <section className="mt-6" aria-labelledby="course-outline-title">
      <h2 id="course-outline-title" className="text-xl font-bold">
        Lessons & chapters
      </h2>
      <p className="mb-5 mt-2 text-sm text-zinc-600">
        {admin
          ? "Drag lesson cards to reorder. Drag chapters within or between lessons. To use the keyboard, focus a card, press Space, use the arrow keys, then press Space to drop."
          : "Choose a chapter to open its content."}
      </p>
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={collision}
        onDragEnd={({ active, over }) => {
          if (disabled || !over || active.id === over.id) return;
          const from = String(active.id),
            to = String(over.id);
          if (from.startsWith("lesson:") && to.startsWith("lesson:")) {
            void save(
              arrayMove(
                modules,
                modules.findIndex((m) => `lesson:${m.id}` === from),
                modules.findIndex((m) => `lesson:${m.id}` === to),
              ),
              chapters,
            );
            return;
          }
          const moved = chapters.find((ch) => `chapter:${ch.id}` === from);
          if (!moved) return;
          const target = chapters.find((ch) => `chapter:${ch.id}` === to);
          const moduleId = target
            ? (target.module_id ?? null)
            : to === groupKey(null)
              ? null
              : modules.find((m) => groupKey(m.id) === to)?.id;
          if (moduleId === undefined) return;
          const next = chapters.filter((ch) => ch.id !== moved.id);
          const index = target
            ? next.findIndex((ch) => ch.id === target.id) +
              ((moved.module_id ?? null) === moduleId &&
              chapters.indexOf(moved) < chapters.indexOf(target)
                ? 1
                : 0)
            : next.length;
          next.splice(index, 0, { ...moved, module_id: moduleId });
          void save(modules, next);
        }}
      >
        <SortableContext
          items={modules.map((m) => `lesson:${m.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {modules.map((m, index) => (
              <Surface
                key={m.id}
                id={`lesson:${m.id}`}
                label={`Lesson ${index + 1}: ${m.title}`}
                disabled={disabled}
              >
                <article className="card">
                  <header
                    data-lesson-surface
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">
                        Lesson {index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">{m.title}</h3>
                    </div>
                    {admin && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={disabled}
                        onClick={() =>
                          setEditing(editing === m.id ? null : m.id)
                        }
                      >
                        {editing === m.id ? "Done" : "Edit lesson"}
                      </button>
                    )}
                  </header>
                  {editing === m.id && (
                    <form
                      className="mx-5 mb-4 flex flex-wrap items-end gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const title = String(
                          new FormData(e.currentTarget).get("title"),
                        );
                        if (await run("/modules", "POST", { id: m.id, title }))
                          setEditing(null);
                      }}
                    >
                      <label className="label min-w-0 flex-1">
                        Lesson title
                        <input
                          className="field"
                          name="title"
                          defaultValue={m.title}
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
                          chapters.some((ch) => ch.module_id === m.id)
                        }
                        onClick={async () => {
                          if (
                            window.confirm("Delete this empty lesson?") &&
                            (await run("/modules", "DELETE", { id: m.id }))
                          )
                            setEditing(null);
                        }}
                      >
                        Delete lesson
                      </button>
                    </form>
                  )}
                  <div className="px-3 pb-3 sm:px-5 sm:pb-5">
                    {chapterRows(m.id)}
                  </div>
                </article>
              </Surface>
            ))}
          </div>
        </SortableContext>
        {chapters.some((ch) => !ch.module_id) && (
          <section className="card mt-4 p-5">
            <h3 className="mb-3 font-semibold">Chapters without a lesson</h3>
            {chapterRows(null)}
          </section>
        )}
      </DndContext>
      {!modules.length && !chapters.length && (
        <div className="card p-8 text-center">
          <h3 className="font-semibold">Start your course outline</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Add your first lesson, then create its chapters.
          </p>
        </div>
      )}
      {admin && (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={disabled}
              onClick={() => setAdding(adding === "lesson" ? null : "lesson")}
            >
              ＋ Add lesson
            </button>
            <button
              className="btn-secondary"
              disabled={disabled || !modules.length}
              onClick={() => setAdding(adding === "chapter" ? null : "chapter")}
            >
              ＋ Add chapter
            </button>
          </div>
          {adding === "lesson" && (
            <form
              className="mt-4 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const title = String(
                  new FormData(e.currentTarget).get("title"),
                );
                if (await run("/modules", "POST", { title })) setAdding(null);
              }}
            >
              <label className="label min-w-0 flex-1">
                New lesson title
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
                Create lesson
              </button>
            </form>
          )}
          {adding === "chapter" && (
            <form
              className="mt-4 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const moduleId = String(
                  new FormData(e.currentTarget).get("moduleId"),
                );
                if (await run("/lessons", "POST", { moduleId }))
                  setAdding(null);
              }}
            >
              <label className="label min-w-0 flex-1">
                Add chapter to
                <select className="field" name="moduleId" disabled={disabled}>
                  {modules.map((m, index) => (
                    <option key={m.id} value={m.id}>
                      Lesson {index + 1}: {m.title}
                    </option>
                  ))}
                </select>
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
