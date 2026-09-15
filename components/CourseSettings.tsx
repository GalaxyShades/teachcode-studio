"use client";
import { useState, useId } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
};
export function CourseSettings({ course }: { course: Course }) {
  const slugHelpId = useId();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button className="btn-secondary gap-2">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="3" fill="white" />
            <circle cx="15" cy="17" r="3" fill="white" />
          </svg>
          Course settings
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl sm:p-6">
          <Dialog.Title className="text-xl font-bold">
            Course settings
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-zinc-600">
            Update the course details and publishing status.
          </Dialog.Description>
          <form
            className="mt-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const data = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setError("");
              try {
                const response = await fetch(`/api/courses/${course.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(
                    result.error || "Could not save course settings",
                  );
                window.location.assign(`/courses/${course.id}`);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not save course settings",
                );
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <label className="label block">
                Title
                <input
                  className="field"
                  name="title"
                  defaultValue={course.title}
                  required
                />
              </label>
              <div>
                <label className="label block">
                  Slug
                  <input
                    className="field"
                    name="slug"
                    aria-describedby={slugHelpId}
                    defaultValue={course.slug}
                    required
                    pattern="[a-z0-9-]+"
                  />
                </label>
                <p id={slugHelpId} className="mt-1 text-xs text-zinc-500">
                  Used in the course URL. Use lowercase letters, numbers, and
                  hyphens.
                </p>
              </div>
              <label className="label block">
                Description
                <textarea
                  className="field"
                  name="description"
                  rows={3}
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
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="btn-secondary">
                    Cancel
                  </button>
                </Dialog.Close>
                <button className="btn-primary">
                  {busy ? "Saving…" : "Save course"}
                </button>
              </div>
            </fieldset>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
