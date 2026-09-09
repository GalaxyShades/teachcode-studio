"use client";
import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions";
export default function Login() {
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form action={action} className="card w-full max-w-md p-8">
        <p className="text-sm font-semibold text-teal-600">TeachCode</p>
        <h1 className="mt-2 text-2xl font-bold">Content Studio</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Sign in with your existing TeachCode account.
        </p>
        <label className="label mt-6 block">
          Email
          <input
            className="field"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className="label mt-4 block">
          Password
          <input
            className="field"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {state.error && (
          <p role="alert" className="mt-4 text-red-700">
            {state.error}
          </p>
        )}
        <button disabled={pending} className="btn-primary mt-6 w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
