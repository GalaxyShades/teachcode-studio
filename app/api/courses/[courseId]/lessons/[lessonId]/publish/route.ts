import { NextResponse } from "next/server";
import { publishDraft, unpublishDraft } from "@/app/actions";
import { apiError, sameOrigin } from "@/lib/api";
import { LessonSchema } from "@/lib/content";
type C = { params: Promise<{ courseId: string; lessonId: string }> };
export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params;
    const result = await publishDraft(
      p.courseId,
      p.lessonId,
      LessonSchema.parse(await req.json()),
    );
    return NextResponse.json(result, {
      status: "error" in result ? result.status : 200,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params;
    await unpublishDraft(p.courseId, p.lessonId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
