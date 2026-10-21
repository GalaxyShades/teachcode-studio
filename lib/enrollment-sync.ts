import { db } from "./db";
import { teachcodeApiOrigin } from "./teachcode-session";

type Member = { email: string; access_role: string };

/** Projects published Studio membership onto TeachCode enrollment. */
export async function syncPublishedCourse(courseId: string): Promise<void> {
  const course = (
    await db().query<{ slug: string; title: string; status: string }>(
      "SELECT slug, title, status FROM cms_courses WHERE id=$1",
      [courseId],
    )
  ).rows[0];
  if (!course || course.status !== "published") return;
  const members = (
    await db().query<Member>(
      `SELECT p.email, a.access_role
       FROM cms_course_staff_assignments a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.course_id=$1 AND a.access_role IN ('owner', 'editor')
       ORDER BY a.access_role DESC, lower(p.email)`,
      [courseId],
    )
  ).rows;
  const origin = teachcodeApiOrigin();
  const secret = process.env.STUDIO_MANAGEMENT_SECRET?.trim();
  if (!origin || !secret) return;
  try {
    const response = await fetch(`${origin}/v1/enrollment/studio-courses`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Management-Secret": secret,
      },
      body: JSON.stringify({
        slug: course.slug,
        title: course.title,
        members: members.map((member) => ({
          email: member.email,
          role: member.access_role === "owner" ? "owner" : "editor",
        })),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) console.error("Could not register the course for enrollment.");
  } catch {
    console.error("Could not register the course for enrollment.");
  }
}
