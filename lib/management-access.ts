import crypto from "node:crypto";
import type { User } from "./auth";
import { coursesForUser } from "./cms";
import { db, isSqlite } from "./db";
import { syncPublishedCourse } from "./enrollment-sync";
import { CmsError } from "./repository";
import { upsertStudioProfile } from "./teachcode-session";

export type CourseAccessRole = "owner" | "editor";

export type ManagedCourseEditor = { name: string; email: string };

export type ManagedCourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  hasPublishedLesson: boolean;
  ownerName: string;
  ownerEmail: string;
  editors: ManagedCourseEditor[];
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

type AccessMember = {
  access_role: CourseAccessRole;
  display_name: string;
  email: string;
};

/** Owner and editors come from access_role. A course with no owner row has no owner label. */
export function courseAccessFromMembers(members: AccessMember[]): {
  ownerName: string;
  ownerEmail: string;
  editors: ManagedCourseEditor[];
} {
  const owner = members.find((member) => member.access_role === "owner");
  return {
    ownerName: owner?.display_name || owner?.email || "",
    ownerEmail: owner?.email || "",
    editors: members
      .filter((member) => member.access_role === "editor")
      .map((member) => ({
        name: member.display_name || member.email,
        email: member.email,
      })),
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
  const [assignees, published] = await Promise.all([
    db().query<AccessMember & { course_id: string }>(
      `SELECT a.course_id, a.access_role, p.display_name, p.email
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
  const byCourse = new Map<string, AccessMember[]>();
  for (const row of assignees.rows) {
    const list = byCourse.get(row.course_id) ?? [];
    list.push(row);
    byCourse.set(row.course_id, list);
  }
  const publishedIds = new Set(published.rows.map((row) => row.course_id));
  return courses.map((course) => {
    const access = courseAccessFromMembers(byCourse.get(course.id) ?? []);
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description || "",
      status: course.status,
      hasPublishedLesson: publishedIds.has(course.id),
      ownerName: access.ownerName,
      ownerEmail: access.ownerEmail,
      editors: access.editors,
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

export type CourseAccessResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Writes one course membership. Owner transfer demotes the previous owner to editor.
 * Removing the owner row is refused.
 */
export async function writeCourseAccess(input: {
  courseId: string;
  profileId: string;
  assignedBy: string;
  role: CourseAccessRole;
  assigned: boolean;
}): Promise<CourseAccessResult> {
  const course = (
    await db().query<{ id: string }>("SELECT id FROM cms_courses WHERE id=$1", [
      input.courseId,
    ])
  ).rows[0];
  if (!course) return { ok: false, status: 404, error: "Course not found" };
  const target = (
    await db().query<{ role: string }>("SELECT role FROM profiles WHERE id=$1", [
      input.profileId,
    ])
  ).rows[0];
  if (!target || (target.role !== "staff" && target.role !== "admin")) {
    return { ok: false, status: 400, error: "Select a teacher or admin account" };
  }
  try {
    await db().transaction(async (c) => {
      await c.query(
        "SELECT id FROM cms_courses WHERE id=$1" + (isSqlite() ? "" : " FOR UPDATE"),
        [input.courseId],
      );
      const current = (
        await c.query<{ access_role: CourseAccessRole }>(
          "SELECT access_role FROM cms_course_staff_assignments WHERE course_id=$1 AND profile_id=$2",
          [input.courseId, input.profileId],
        )
      ).rows[0];
      if (!input.assigned) {
        if (!current) return;
        if (current.access_role === "owner") {
          throw new CmsError(400, "Transfer ownership instead of removing the owner.");
        }
        await c.query(
          "DELETE FROM cms_course_staff_assignments WHERE course_id=$1 AND profile_id=$2 AND access_role='editor'",
          [input.courseId, input.profileId],
        );
        return;
      }
      if (input.role === "editor" && current?.access_role === "owner") {
        throw new CmsError(400, "That teacher already owns this course.");
      }
      if (input.role === "owner") {
        await c.query(
          "UPDATE cms_course_staff_assignments SET access_role='editor' WHERE course_id=$1 AND access_role='owner' AND profile_id<>$2",
          [input.courseId, input.profileId],
        );
      }
      await c.query(
        `INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by,access_role)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(course_id,profile_id) DO UPDATE
         SET access_role=excluded.access_role, assigned_by=excluded.assigned_by`,
        [input.courseId, input.profileId, input.assignedBy, input.role],
      );
    });
  } catch (error) {
    if (error instanceof CmsError) {
      const status = error.status === 404 ? 404 : 400;
      return { ok: false, status, error: error.message };
    }
    throw error;
  }
  await syncPublishedCourse(input.courseId);
  return { ok: true };
}

/** Admin may set either role. A course owner may only add or remove editors. */
export async function setManagedCourseTeacher(input: {
  claimedRole: string;
  claimedEmail: string;
  courseId: string;
  staffEmail: string;
  assigned: boolean;
  role: CourseAccessRole;
}): Promise<CourseAccessResult> {
  const role = input.role === "owner" ? "owner" : "editor";
  if (input.claimedRole !== "admin" && input.claimedRole !== "staff") {
    return { ok: false, status: 403, error: "Only an admin or the course owner may share access" };
  }
  if (input.claimedRole !== "admin" && role !== "editor") {
    return { ok: false, status: 403, error: "Only an admin can change the owner." };
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

  let assignedBy = "";
  if (input.claimedRole === "admin") {
    const admin = (
      await db().query<{ id: string }>(
        "SELECT id FROM profiles WHERE role='admin' AND lower(email)=lower($1)",
        [input.claimedEmail],
      )
    ).rows[0];
    const fallback = (
      await db().query<{ id: string }>(
        "SELECT id FROM profiles WHERE role='admin' ORDER BY email LIMIT 1",
      )
    ).rows[0];
    assignedBy = admin?.id ?? fallback?.id ?? "";
  } else {
    const owner = (
      await db().query<{ id: string }>(
        `SELECT p.id FROM cms_course_staff_assignments a
         JOIN profiles p ON p.id = a.profile_id
         WHERE a.course_id=$1 AND a.access_role='owner' AND lower(p.email)=lower($2)`,
        [input.courseId, input.claimedEmail],
      )
    ).rows[0];
    if (!owner) {
      return { ok: false, status: 403, error: "Only the course owner may share editors." };
    }
    assignedBy = owner.id;
  }
  if (!assignedBy) return { ok: false, status: 403, error: "Only an admin can change the owner." };

  let teacher = (
    await db().query<{ id: string }>(
      "SELECT id FROM profiles WHERE lower(email)=lower($1)",
      [email],
    )
  ).rows[0];
  if (!teacher && input.assigned) {
    teacher = await upsertStudioProfile({ email, displayName: email, role: "staff" });
  }
  if (!teacher) return { ok: true };
  return writeCourseAccess({
    courseId: input.courseId,
    profileId: teacher.id,
    assignedBy,
    role,
    assigned: input.assigned,
  });
}
