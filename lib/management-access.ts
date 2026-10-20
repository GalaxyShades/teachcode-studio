import crypto from "node:crypto";
import type { User } from "./auth";
import { coursesForUser } from "./cms";
import { db } from "./db";
import { upsertStudioProfile } from "./teachcode-session";

export type ManagedCourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  hasPublishedLesson: boolean;
  ownerName: string;
  ownerEmail: string;
  lessonCount: number;
};

function requestHost(req: Request): string {
  const raw = req.headers.get("host") || new URL(req.url).host;
  return raw.split(":")[0].toLowerCase();
}

/**
 * Localhost with the shared secret is allowed, even if a proxy header is present.
 * TeachCode calls this from 127.0.0.1 and may forward X-Forwarded-For.
 * A public Host is 404. A localhost request with a bad secret is 401.
 */
export function managementDenial(req: Request): 401 | 404 | null {
  const host = requestHost(req);
  if (host !== "127.0.0.1" && host !== "localhost") return 404;
  const expected = process.env.STUDIO_MANAGEMENT_SECRET || "";
  const given = req.headers.get("x-studio-management-secret") || "";
  if (
    expected.length < 16 ||
    given.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return 401;
  }
  return null;
}

type OwnerProfile = { id: string; display_name: string; email: string };

/** Assigned teacher wins. The creator is the owner only when nobody else is assigned. */
export function ownerFromAssignment(
  createdBy: string,
  assignees: OwnerProfile[],
  creator: { display_name: string; email: string } | undefined,
): { ownerName: string; ownerEmail: string } {
  const designated =
    assignees.find((person) => person.id !== createdBy) ?? assignees[0];
  const owner = designated ?? creator;
  return {
    ownerName: owner?.display_name || owner?.email || "Unknown",
    ownerEmail: owner?.email || "",
  };
}

function placeholders(ids: string[], offset = 0): string {
  return ids.map((_, index) => `$${index + 1 + offset}`).join(",");
}

type EnrichableCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  created_by: string;
  lesson_count?: number | string | null;
};

async function enrichCourses(courses: EnrichableCourse[]): Promise<ManagedCourseRow[]> {
  if (courses.length === 0) return [];
  const courseIds = courses.map((course) => course.id);
  const creatorIds = [...new Set(courses.map((course) => course.created_by))];
  const [creators, assignees, published] = await Promise.all([
    db().query<OwnerProfile>(
      `SELECT id, display_name, email FROM profiles WHERE id IN (${placeholders(creatorIds)})`,
      creatorIds,
    ),
    db().query<OwnerProfile & { course_id: string }>(
      `SELECT a.course_id, p.id, p.display_name, p.email
       FROM cms_course_staff_assignments a
       JOIN profiles p ON p.id = a.profile_id
       WHERE a.course_id IN (${placeholders(courseIds)})
       ORDER BY p.display_name, p.email`,
      courseIds,
    ),
    db().query<{ course_id: string }>(
      `SELECT DISTINCT course_id FROM cms_lessons
       WHERE status='published' AND published_revision_id IS NOT NULL
       AND course_id IN (${placeholders(courseIds)})`,
      courseIds,
    ),
  ]);
  const byCreator = new Map(creators.rows.map((row) => [row.id, row]));
  const byCourse = new Map<string, OwnerProfile[]>();
  for (const row of assignees.rows) {
    const list = byCourse.get(row.course_id) ?? [];
    list.push(row);
    byCourse.set(row.course_id, list);
  }
  const publishedIds = new Set(published.rows.map((row) => row.course_id));
  return courses.map((course) => {
    const owner = ownerFromAssignment(
      course.created_by,
      byCourse.get(course.id) ?? [],
      byCreator.get(course.created_by),
    );
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description || "",
      status: course.status,
      hasPublishedLesson: publishedIds.has(course.id),
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail,
      lessonCount: Number(course.lesson_count ?? 0),
    };
  });
}

export function groupCoursesByOwner<T extends { ownerName: string; ownerEmail: string }>(
  courses: T[],
): { heading: string; courses: T[] }[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const course of courses) {
    const key = course.ownerEmail || course.ownerName || "unknown";
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(course);
  }
  return order.map((key) => {
    const list = groups.get(key) ?? [];
    const first = list[0];
    const heading =
      first && first.ownerName && first.ownerEmail
        ? `${first.ownerName} (${first.ownerEmail})`
        : first?.ownerName || first?.ownerEmail || "Unknown owner";
    return { heading, courses: list };
  });
}

/** Admin and staff course lists with the same owner labels as the management API. */
export async function listCoursesWithOwners(user: User): Promise<ManagedCourseRow[]> {
  const courses = (await coursesForUser(user)) as EnrichableCourse[];
  return enrichCourses(courses);
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
        `SELECT id, slug, title, description, status, created_by,
                (SELECT count(*) FROM cms_lessons l WHERE l.course_id=cms_courses.id) AS lesson_count
         FROM cms_courses ORDER BY title, id`,
      )
    ).rows;
    return enrichCourses(courses);
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return [];
  let profile = (
    await db().query<User>(
      "SELECT id, email, display_name, role FROM profiles WHERE lower(email)=lower($1)",
      [normalized],
    )
  ).rows[0];
  if (!profile || profile.role === "student") {
    profile = await upsertStudioProfile({
      email: normalized,
      displayName: normalized,
      role: "staff",
    });
  } else if (profile.role !== "admin" && profile.role !== "staff") {
    return [];
  }
  const courses = (await coursesForUser({ ...profile, role: "staff" })) as EnrichableCourse[];
  return enrichCourses(courses);
}

/** Admin-only. Matches a TeachCode teacher by email and updates the Studio assignment. */
export async function setManagedCourseTeacher(input: {
  claimedRole: string;
  courseId: string;
  staffEmail: string;
  assigned: boolean;
}): Promise<{ ok: true } | { ok: false; status: 400 | 403 | 404; error: string }> {
  if (input.claimedRole !== "admin") {
    return { ok: false, status: 403, error: "Only admins may assign teachers" };
  }
  const email = input.staffEmail.trim().toLowerCase();
  if (!email.includes("@") || !input.courseId) {
    return { ok: false, status: 400, error: "Choose a course and a teacher" };
  }
  const course = (
    await db().query<{ id: string }>("SELECT id FROM cms_courses WHERE id=$1", [
      input.courseId,
    ])
  ).rows[0];
  if (!course) return { ok: false, status: 404, error: "Course not found" };

  if (!input.assigned) {
    const profile = (
      await db().query<{ id: string }>(
        "SELECT id FROM profiles WHERE lower(email)=lower($1)",
        [email],
      )
    ).rows[0];
    if (profile) {
      await db().query(
        "DELETE FROM cms_course_staff_assignments WHERE course_id=$1 AND profile_id=$2",
        [input.courseId, profile.id],
      );
    }
    return { ok: true };
  }

  const teacher = await upsertStudioProfile({
    email,
    displayName: email,
    role: "staff",
  });
  const admin = (
    await db().query<{ id: string }>(
      "SELECT id FROM profiles WHERE role='admin' ORDER BY email LIMIT 1",
    )
  ).rows[0];
  await db().query(
    "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [input.courseId, teacher.id, admin?.id ?? teacher.id],
  );
  return { ok: true };
}
