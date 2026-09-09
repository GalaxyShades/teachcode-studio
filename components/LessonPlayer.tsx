"use client";
import { useState } from "react";
import type { LessonDraft } from "@/lib/content";
import { BlockRenderer } from "./BlockRenderer";
export function LessonPlayer({ draft }: { draft: LessonDraft }) {
  const [index, setIndex] = useState(0);
  const step = draft.steps[index];
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <p className="font-semibold text-teal-800">TeachCode lesson</p>
      <h1 className="my-3 text-3xl font-bold">{draft.title}</h1>
      <div className="flex flex-wrap gap-2">
        {[draft.track, draft.level, draft.mode, ...draft.tags].map((s, i) => (
          <span
            key={i}
            className="rounded bg-teal-50 px-2 py-1 text-sm text-teal-900"
          >
            {s}
          </span>
        ))}
      </div>
      <p className="my-4 whitespace-pre-wrap">{draft.description}</p>
      <nav aria-label="Lesson steps" className="my-5 flex flex-wrap gap-2">
        {draft.steps.map((s, i) => (
          <button
            key={s.id}
            className={index === i ? "btn-primary" : "btn-secondary"}
            aria-current={index === i ? "step" : undefined}
            onClick={() => setIndex(i)}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>
      <p role="status">
        Step {index + 1} of {draft.steps.length}
      </p>
      <progress
        className="my-3 w-full"
        value={index + 1}
        max={draft.steps.length}
        aria-label="Lesson progress"
      />
      <section className="card p-5">
        <h2 className="mb-4 text-xl font-bold">{step?.title}</h2>
        {step?.blocks.map((b) => (
          <div className="my-5" key={b.id}>
            <BlockRenderer block={b} />
          </div>
        ))}
      </section>
      <div className="mt-4 flex justify-between">
        <button
          className="btn-secondary"
          disabled={!index}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </button>
        <button
          className="btn-primary"
          disabled={index === draft.steps.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}
