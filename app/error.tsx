"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Unable to load this page</h1>
      <p role="alert" className="my-4">
        {error.message}
      </p>
      <button className="btn-primary" onClick={reset}>
        Try again
      </button>
      <a href="/courses" className="ml-4 underline">
        Courses
      </a>
    </main>
  );
}
