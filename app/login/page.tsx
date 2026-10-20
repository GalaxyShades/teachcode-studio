import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { TeachCodeLink } from "@/components/TeachCodeLink";
import { STUDIO_HANDOFF_SKIP_COOKIE, studioPublicHref } from "@/lib/teachcode-public";
import { LoginForm } from "./LoginForm";
export default async function Login() {
  if (await currentUser()) redirect(studioPublicHref("/courses") ?? "/courses");
  if (!(await cookies()).get(STUDIO_HANDOFF_SKIP_COOKIE)?.value) {
    redirect(studioPublicHref("/api/auth/teachcode", "next=/courses") ?? "/api/auth/teachcode?next=/courses");
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <TeachCodeLink />
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
