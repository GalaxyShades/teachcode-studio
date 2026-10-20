import { currentUser } from "@/lib/auth";
import { TeachCodeLink } from "@/components/TeachCodeLink";
import { redirect } from "next/navigation";
export default async function CourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await currentUser())) redirect("/api/auth/teachcode?next=/courses");
  return (
    <>
      <div className="mx-auto flex max-w-6xl justify-end px-6 pt-4">
        <TeachCodeLink />
      </div>
      {children}
    </>
  );
}
