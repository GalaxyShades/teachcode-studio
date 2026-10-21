import { db } from "./db";
import { teachcodeApiOrigin } from "./teachcode-session";

type Owner = { id: string; display_name: string; email: string };

/** Assigned teacher wins. The creator is the owner only when nobody else is assigned. */
function ownerEmail(createdBy: string, assignees: Owner[], creator: Owner | undefined): string {
  const designated = assignees.find((person) => person.id !== createdBy) ?? assignees[0];
  return (designated ?? creator)?.email ?? "";
}

/** Registers a published Studio course in TeachCode so teachers can offer it in a semester. */
export async function syncPublishedCourse(courseId: string): Promise<void> {
  const course = (
    await db().query<{ slug: string; title: string; status: string; created_by: string }>(
      "SELECT slug, title, status, created_by FROM cms_courses WHERE id=$1",
      [courseId],
    )
  ).rows[0];
  if (!course || course.status !== "published") return;
  const [creator, assignees] = await Promise.all([
    db().query<Owner>("SELECT id, display_name, email FROM profiles WHERE id=$1", [
      course.created_by,
    ]),
    db().query<Owner>(
      `SELECT p.id, p.display_name, p.email
       FROM cms_course_staff_assignments a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.course_id=$1`,
      [courseId],
    ),
  ]);
  const email = ownerEmail(course.created_by, assignees.rows, creator.rows[0]);
  if (!email) return;
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
        owner_email: email,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) console.error("Could not register the course for enrollment.");
  } catch {
    console.error("Could not register the course for enrollment.");
  }
}
