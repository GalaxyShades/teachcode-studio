"use client";
import { useState } from "react";
type Person = { id: string; display_name: string; email: string };
export function StaffAssignments({
  courseId,
  initialStaff,
}: {
  courseId: string;
  initialStaff: Person[];
}) {
  const [staff, setStaff] = useState(initialStaff),
    [users, setUsers] = useState<Person[]>([]),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function assign(userId: string, assigned: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/assignments`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, assigned }),
        }),
        result = await res.json();
      if (!res.ok) throw new Error(result.error);
      const next = await fetch(`/api/courses/${courseId}/assignments`);
      if (!next.ok) throw new Error("Could not reload assignments");
      setStaff(await next.json());
      setStatus(assigned ? "Assigned" : "Assignment removed");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mt-6 p-4">
      <h2 className="text-xl font-bold">Assign staff</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Assigned staff can edit drafts for this course. They cannot assign
        other people.
      </p>
      <p role="status" className="my-3 text-sm empty:my-0">
        {status}
      </p>
      {staff.map((s) => (
        <p className="my-2 flex items-center justify-between gap-2" key={s.id}>
          {s.display_name} · {s.email}
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => assign(s.id, false)}
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
          const res = await fetch("/api/users?q=" + encodeURIComponent(query));
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
            onClick={() => assign(u.id, true)}
          >
            Assign
          </button>
        </p>
      ))}
    </section>
  );
}
