"use client";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/actions";
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="btn-secondary">
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
export function SignOut() {
  return (
    <form
      action={logoutAction}
      onSubmit={(e) => {
        if (!window.confirm("Sign out of Content Studio?")) e.preventDefault();
      }}
    >
      <Submit />
    </form>
  );
}
