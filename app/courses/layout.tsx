import { currentUser } from "@/lib/auth";
import { CoursePlanner } from "@/components/CoursePlanner";
import { TeachCodeLink } from "@/components/TeachCodeLink";
import { studioPublicHref, teachcodeLearnHref } from "@/lib/teachcode-public";
import { redirect } from "next/navigation";
export default async function CourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await currentUser())) {
    if (teachcodeLearnHref()) {
      redirect(
        studioPublicHref("/api/auth/teachcode", "next=/courses") ??
          "/api/auth/teachcode?next=/courses",
      );
    }
    redirect("/login");
  }
  return (
    <>
      <div className="mx-auto flex max-w-6xl justify-end px-6 pt-4">
        <TeachCodeLink />
      </div>
      {children}
      <CoursePlanner />
    </>
  );
}
