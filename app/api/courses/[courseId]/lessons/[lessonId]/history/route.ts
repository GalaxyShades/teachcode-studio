import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCourse } from "@/lib/cms";
import { db } from "@/lib/db";
import { CmsError, restoreRevision } from "@/lib/repository";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string; lessonId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    const p = await params;
    await requireCourse(p.courseId);
    const lesson = (
      await db().query(
        "SELECT published_revision_id FROM cms_lessons WHERE id=$1 AND course_id=$2",
        [p.lessonId, p.courseId],
      )
    ).rows[0];
    if (!lesson) throw new CmsError(404, "Chapter not found");
    const versions = (
      await db().query(
        "SELECT r.id,r.revision_number,r.created_at,m.title,p.display_name AS editor FROM cms_lesson_revisions r JOIN cms_revision_metadata m ON m.revision_id=r.id JOIN profiles p ON p.id=r.created_by WHERE r.lesson_id=$1 AND r.state='published' ORDER BY r.revision_number DESC LIMIT 5",
        [p.lessonId],
      )
    ).rows;
    return NextResponse.json(
      { versions, publishedId: lesson.published_revision_id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params;
    const user = await requireCourse(p.courseId);
    const body = z
      .object({
        revisionId: z.string().min(1),
        version: z.number().int().nonnegative(),
      })
      .parse(await req.json());
    return NextResponse.json(
      await restoreRevision(
        p.courseId,
        p.lessonId,
        body.revisionId,
        body.version,
        user.id,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
