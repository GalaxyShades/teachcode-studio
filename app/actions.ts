"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login, logout } from "@/lib/auth";
import {
  createCourse,
  createLesson,
  requireCourse,
  requireAdmin,
} from "@/lib/cms";
import { persistDraft, publishRevision, CmsError } from "@/lib/repository";
import { db } from "@/lib/db";
import type { LessonDraft } from "@/lib/content";
export async function loginAction(_: unknown, form: FormData) {
  try {
    if (!(await login(String(form.get("email")), String(form.get("password")))))
      return { error: "Invalid email, password, or CMS role." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in failed" };
  }
  redirect("/courses");
}
export async function logoutAction() {
  await logout();
  redirect("/login");
}
export async function createCourseAction(f: FormData) {
  redirect(`/courses/${await createCourse(f)}`);
}
export async function newLessonAction(courseId: string) {
  redirect(`/courses/${courseId}/lessons/${await createLesson(courseId)}/edit`);
}
export async function saveDraft(
  courseId: string,
  lessonId: string,
  draft: LessonDraft,
) {
  try {
    const u = await requireCourse(courseId);
    return {
      ...(await persistDraft(courseId, lessonId, draft, u.id)),
      editor: u.display_name,
    };
  } catch (e) {
    if (e instanceof CmsError) return { error: e.message, status: e.status };
    throw e;
  }
}
export async function publishDraft(
  courseId: string,
  lessonId: string,
  draft: LessonDraft,
) {
  try {
    const u = await requireAdmin(courseId);
    const result = await publishRevision(courseId, lessonId, draft, u.id);
    revalidatePath("/published", "layout");
    return { ...result, editor: u.display_name };
  } catch (e) {
    if (e instanceof CmsError) return { error: e.message, status: e.status };
    throw e;
  }
}
export async function unpublishDraft(
  courseId: string,
  lessonId: string,
  archive = false,
) {
  await requireAdmin(courseId);
  const result = await db().query(
    "UPDATE cms_lessons SET published_revision_id=NULL,status=$1,version=version+1 WHERE id=$2 AND course_id=$3",
    [archive ? "archived" : "draft", lessonId, courseId],
  );
  if (!result.rowCount) throw new CmsError(404, "Lesson not found");
  revalidatePath("/published", "layout");
}
