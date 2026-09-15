"use client";
import { useState } from "react";
import { CourseOutline } from "./CourseOutline";
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
    try {
      const r = await fetch(base);
      if (!r.ok)
        throw new Error(
          "Could not reload the outline. Refresh the page to see the latest saved content.",
        );
      const c = await r.json();
      setModules(c.modules);
      setLessons(c.lessons);
      setStaff(c.staff);
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
      <CourseOutline
        course={course}
        modules={modules}
        chapters={lessons}
        admin={admin}
        busy={busy}
        perform={request}
        refresh={refresh}
      />
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
