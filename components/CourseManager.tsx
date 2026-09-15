"use client";
import { useState } from "react";
import { SortableList } from "./SortableList";
import { lessonPath } from "@/lib/paths";
type Item = { id: string; title: string; [key: string]: any };
export function CourseManager({
  course,
  initialModules,
  initialLessons,
  initialStaff,
  admin,
}: {
  course: Item;
  initialModules: Item[];
  initialLessons: Item[];
  initialStaff: Item[];
  admin: boolean;
}) {
  const [modules, setModules] = useState(initialModules),
    [lessons, setLessons] = useState(initialLessons),
    [staff, setStaff] = useState(initialStaff),
    [users, setUsers] = useState<Item[]>([]),
    [query, setQuery] = useState(""),
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
    const r = await fetch(base);
    if (r.ok) {
      const c = await r.json();
      setModules(c.modules);
      setLessons(c.lessons);
      setStaff(c.staff);
    }
  }
  async function order(kind: "modules" | "lessons", next: Item[]) {
    if (
      await request("/reorder", "PUT", { kind, ids: next.map((x) => x.id) })
    ) {
      if (kind === "modules") setModules(next);
      else setLessons(next);
      setStatus(`${kind} reordered`);
    }
  }
  function bump(
    kind: "modules" | "lessons",
    items: Item[],
    i: number,
    d: number,
  ) {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void order(kind, next);
  }
  function lessonRow(l: Item) {
    const i = lessons.findIndex((x) => x.id === l.id);
    return (
      <div className="my-2 rounded border p-3">
        <a
          className="font-semibold text-teal-800 underline"
          href={lessonPath(
            { id: course.id, slug: course.slug },
            { slug: l.slug },
          )}
        >
          {l.title}
        </a>
        <p className="text-sm">
          {l.status} · Updated {String(l.updated_at)}
        </p>
        {admin && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy || !i}
              className="btn-secondary"
              onClick={() => bump("lessons", lessons, i, -1)}
            >
              ↑ Lesson
            </button>
            <button
              disabled={busy || i === lessons.length - 1}
              className="btn-secondary"
              onClick={() => bump("lessons", lessons, i, 1)}
            >
              ↓ Lesson
            </button>
            <label>
              Module
              <select
                className="field"
                value={l.module_id ?? ""}
                onChange={async (e) => {
                  if (
                    await request(`/lessons/${l.id}`, "PATCH", {
                      moduleId: e.target.value || null,
                    })
                  )
                    await refresh();
                }}
              >
                <option value="">Unassigned</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {l.status === "published" && (
          <a
            className="text-sm text-teal-800 underline"
            href={`/published/courses/${course.slug}/lessons/${l.slug}`}
          >
            View public lesson
          </a>
        )}
      </div>
    );
  }
  return (
    <>
      <p role="status" className="my-3">
        {status}
      </p>
      {admin && (
        <details className="card mt-5 p-4">
          <summary className="font-semibold">Course settings</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              if (await request("", "PATCH", data))
                window.location.assign(`/courses/${course.id}`);
            }}
          >
            <label className="label block">
              Title
              <input
                className="field"
                name="title"
                defaultValue={course.title}
                required
              />
            </label>
            <label className="label block">
              Slug
              <input
                className="field"
                name="slug"
                defaultValue={course.slug}
                required
                pattern="[a-z0-9-]+"
              />
            </label>
            <label className="label block">
              Description
              <textarea
                className="field"
                name="description"
                defaultValue={course.description}
              />
            </label>
            <label className="label block">
              Status
              <select
                className="field"
                name="status"
                defaultValue={course.status}
              >
                {["draft", "published", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button disabled={busy} className="btn-primary mt-3">
              Save course
            </button>
          </form>
        </details>
      )}
      <section className="card mt-5 p-4">
        <h2 className="text-xl font-bold">Modules</h2>
        {admin ? (
          <>
            <SortableList
              items={modules}
              onChange={(next) => order("modules", next)}
              render={(m, i) => (
                <article className="my-3 rounded border p-3">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await request("/modules", "POST", {
                          id: m.id,
                          title: String(f.get("title")),
                        })
                      )
                        await refresh();
                    }}
                  >
                    <label className="label flex-1">
                      Module title
                      <input
                        className="field"
                        name="title"
                        defaultValue={m.title}
                        required
                      />
                    </label>
                    <button className="btn-secondary" disabled={busy}>
                      Rename
                    </button>
                  </form>
                  <div className="my-2 flex gap-2">
                    <button
                      className="btn-secondary"
                      disabled={busy || !i}
                      onClick={() => bump("modules", modules, i, -1)}
                    >
                      ↑ Module
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy || i === modules.length - 1}
                      onClick={() => bump("modules", modules, i, 1)}
                    >
                      ↓ Module
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          window.confirm("Delete this empty module?") &&
                          (await request("/modules", "DELETE", { id: m.id }))
                        )
                          await refresh();
                      }}
                    >
                      Delete module
                    </button>
                  </div>
                  <p className="text-sm">
                    {lessons.filter((l) => l.module_id === m.id).length} lessons
                  </p>
                </article>
              )}
            />
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                if (
                  await request("/modules", "POST", {
                    title: String(new FormData(form).get("title")),
                  })
                ) {
                  form.reset();
                  await refresh();
                }
              }}
            >
              <label className="label flex-1">
                New module
                <input name="title" className="field" required />
              </label>
              <button className="btn-primary" disabled={busy}>
                Add module
              </button>
            </form>
          </>
        ) : (
          modules.map((m) => (
            <h3 className="my-3 font-semibold" key={m.id}>
              {m.title}
            </h3>
          ))
        )}
        {!modules.length && <p>No modules yet.</p>}
      </section>
      <section className="card mt-5 p-4">
        <h2 className="text-xl font-bold">Lessons</h2>
        {admin ? (
          <SortableList
            items={lessons}
            onChange={(next) => order("lessons", next)}
            render={lessonRow}
          />
        ) : (
          lessons.map((l) => <div key={l.id}>{lessonRow(l)}</div>)
        )}
        {!lessons.length && <p className="mt-3">No lessons yet.</p>}
      </section>
      {admin && (
        <section className="card mt-5 p-4">
          <h2 className="text-xl font-bold">Staff assignments</h2>
          {staff.map((s) => (
            <p
              className="my-2 flex items-center justify-between gap-2"
              key={s.id}
            >
              {s.display_name} · {s.email}
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await request("/assignments", "PUT", {
                      userId: s.id,
                      assigned: false,
                    })
                  )
                    await refresh();
                }}
              >
                Remove assignment
              </button>
            </p>
          ))}
          {!staff.length && <p>No staff assigned.</p>}
          <form
            className="my-3 flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch(
                "/api/users?q=" + encodeURIComponent(query),
              );
              if (res.ok) setUsers(await res.json());
              else setStatus("User search failed");
            }}
          >
            <label className="label flex-1">
              Search staff by name or email
              <input
                className="field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="btn-secondary">Search</button>
          </form>
          {users.map((u) => (
            <p key={u.id} className="my-2 flex justify-between">
              {u.display_name} · {u.email}
              <button
                className="btn-secondary"
                disabled={busy || staff.some((s) => s.id === u.id)}
                onClick={async () => {
                  if (
                    await request("/assignments", "PUT", {
                      userId: u.id,
                      assigned: true,
                    })
                  )
                    await refresh();
                }}
              >
                Assign
              </button>
            </p>
          ))}
        </section>
      )}
    </>
  );
}
