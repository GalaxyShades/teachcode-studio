import crypto from "node:crypto";
import { coursesForUser } from "./cms";
import { db } from "./db";
import type { User } from "./auth";

export type ManagedCourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  hasPublishedLesson: boolean;
  ownerName: string;
  ownerEmail: string;
};

export function managementRequestAllowed(req: Request): boolean {
  const host = (req.headers.get("host") || new URL(req.url).hostname).split(":")[0];
  if (host !== "127.0.0.1" && host !== "localhost") return false;
  if (req.headers.get("x-forwarded-for")) return false;
  const expected = process.env.STUDIO_MANAGEMENT_SECRET || "";
  const given = req.headers.get("x-studio-management-secret") || "";
  if (expected.length < 16 || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function enrichCourses(
  courses: { id: string; slug: string; title: string; description: string; status: string; created_by: string }[],
): Promise<ManagedCourseRow[]> {
  if (courses.length === 0) return [];
  const owners = (
    await db().query<{ id: string; display_name: string; email: string }>(
      "SELECT id, display_name, email FROM profiles WHERE id = ANY($1::uuid[])",
      [courses.map((course) => course.created_by)],
    )
  ).rows;
  const byId = new Map(owners.map((row) => [row.id, row]));
  return Promise.all(
    courses.map(async (course) => {
      const published = (
        await db().query(
          "SELECT 1 FROM cms_lessons WHERE course_id=$1 AND status='published' AND published_revision_id IS NOT NULL",
          [course.id],
        )
      ).rowCount;
      const owner = byId.get(course.created_by);
      return {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description || "",
        status: course.status,
        hasPublishedLesson: published > 0,
        ownerName: owner?.display_name || owner?.email || "Unknown",
        ownerEmail: owner?.email || "",
      };
    }),
  );
}

/**
 * TeachCode server calls this with a shared secret.
 * Admin claim → every course (full rights). Teacher claim → created or assigned.
 */
export async function managedCoursesForEmail(
  email: string,
  claimedRole: string,
): Promise<ManagedCourseRow[]> {
  if (claimedRole !== "admin" && claimedRole !== "staff") return [];

  if (claimedRole === "admin") {
    const courses = (
      await db().query<{
        id: string;
        slug: string;
        title: string;
        description: string;
        status: string;
        created_by: string;
      }>(
        "SELECT id, slug, title, description, status, created_by FROM cms_courses ORDER BY title, id",
      )
    ).rows;
    return enrichCourses(courses);
  }

  const profile = (
    await db().query<User>(
      "SELECT id, email, display_name, role FROM profiles WHERE lower(email)=lower($1)",
      [email],
    )
  ).rows[0];
  if (!profile || !["admin", "staff"].includes(profile.role)) return [];
  const courses = (await coursesForUser(profile)) as {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: string;
    created_by: string;
  }[];
  return enrichCourses(courses);
}
