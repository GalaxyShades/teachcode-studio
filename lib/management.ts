import { z } from "zod";
import crypto from "node:crypto";
import { db, isSqlite } from "./db";
import { requireAdmin } from "./cms";
import { CmsError } from "./repository";
export const CourseUpdate = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  status: z.enum(["draft", "published", "archived"]),
});
export const ModuleInput = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
});
export const OrderInput = z.object({
  kind: z.enum(["modules", "lessons"]),
  ids: z
    .array(z.string())
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs"),
  moduleId: z.string().nullable().optional(),
});
export async function updateCourse(courseId: string, input: unknown) {
  await requireAdmin(courseId);
  const p = CourseUpdate.parse(input);
  await db().query(
    "UPDATE cms_courses SET title=$1,slug=$2,description=$3,status=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$5",
    [p.title, p.slug, p.description, p.status, courseId],
  );
}
async function lockCourse(c: import("./db").Queryable, courseId: string) {
  await c.query(
    "SELECT id FROM cms_courses WHERE id=$1" +
      (isSqlite() ? "" : " FOR UPDATE"),
    [courseId],
  );
}
export async function editModule(courseId: string, input: unknown) {
  await requireAdmin(courseId);
  const p = ModuleInput.parse(input);
  await db().transaction(async (c) => {
    await lockCourse(c, courseId);
    if (p.id) {
      if (
        !(
          await c.query(
            "UPDATE cms_modules SET title=$1 WHERE id=$2 AND course_id=$3",
            [p.title, p.id, courseId],
          )
        ).rowCount
      )
        throw new CmsError(404, "Module not found");
    } else {
      const n = (
        await c.query(
          "SELECT coalesce(max(position),-1)+1 n FROM cms_modules WHERE course_id=$1",
          [courseId],
        )
      ).rows[0].n;
      await c.query(
        "INSERT INTO cms_modules(id,course_id,title,position) VALUES($1,$2,$3,$4)",
        [crypto.randomUUID(), courseId, p.title, n],
      );
    }
  });
}
export async function deleteModule(courseId: string, id: string) {
  await requireAdmin(courseId);
  await db().transaction(async (c) => {
    await lockCourse(c, courseId);
    if (
      (
        await c.query(
          "SELECT id FROM cms_lessons WHERE module_id=$1 AND course_id=$2",
          [id, courseId],
        )
      ).rowCount
    )
      throw new CmsError(409, "Move lessons out before deleting this module");
    if (
      !(
        await c.query("DELETE FROM cms_modules WHERE id=$1 AND course_id=$2", [
          id,
          courseId,
        ])
      ).rowCount
    )
      throw new CmsError(404, "Module not found");
  });
}
export async function reorder(courseId: string, input: unknown) {
  await requireAdmin(courseId);
  const p = OrderInput.parse(input);
  await db().transaction(async (c) => {
    await lockCourse(c, courseId);
    const table = p.kind === "modules" ? "cms_modules" : "cms_lessons";
    const existing = (
      await c.query(`SELECT id FROM ${table} WHERE course_id=$1`, [courseId])
    ).rows.map((r) => r.id);
    if (
      p.ids.length !== existing.length ||
      p.ids.some((id) => !existing.includes(id))
    )
      throw new CmsError(
        409,
        "Ordering must include each course item exactly once; reload and retry",
      );
    // First move positions outside the target range, then assign final positions.
    await c.query(
      `UPDATE ${table} SET position=-position-1000000 WHERE course_id=$1`,
      [courseId],
    );
    for (const [i, id] of p.ids.entries())
      await c.query(
        `UPDATE ${table} SET position=$1 WHERE id=$2 AND course_id=$3`,
        [i, id, courseId],
      );
  });
}
export async function moveLesson(
  courseId: string,
  lessonId: string,
  moduleId: string | null,
) {
  await requireAdmin(courseId);
  await db().transaction(async (c) => {
    await lockCourse(c, courseId);
    if (
      moduleId &&
      !(
        await c.query(
          "SELECT id FROM cms_modules WHERE id=$1 AND course_id=$2",
          [moduleId, courseId],
        )
      ).rowCount
    )
      throw new CmsError(404, "Module not found");
    if (
      !(
        await c.query(
          "UPDATE cms_lessons SET module_id=$1 WHERE id=$2 AND course_id=$3",
          [moduleId, lessonId, courseId],
        )
      ).rowCount
    )
      throw new CmsError(404, "Lesson not found");
  });
}
export async function assignStaff(courseId: string, input: unknown) {
  const u = await requireAdmin(courseId),
    p = z.object({ userId: z.string(), assigned: z.boolean() }).parse(input);
  await db().transaction(async (c) => {
    await lockCourse(c, courseId);
    const user = (
      await c.query("SELECT role FROM profiles WHERE id=$1", [p.userId])
    ).rows[0];
    if (user?.role !== "staff") throw new CmsError(400, "Select a staff user");
    if (p.assigned)
      await c.query(
        "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [courseId, p.userId, u.id],
      );
    else
      await c.query(
        "DELETE FROM cms_course_staff_assignments WHERE course_id=$1 AND profile_id=$2",
        [courseId, p.userId],
      );
  });
}
