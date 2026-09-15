import { NextResponse } from "next/server";
import { getDraft } from "@/lib/cms";
import { saveDraft } from "@/app/actions";
import { apiError, sameOrigin } from "@/lib/api";
import { LessonSchema } from "@/lib/content";
type C = { params: Promise<{ courseId: string; lessonId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    const p = await params;
    return NextResponse.json(await getDraft(p.courseId, p.lessonId));
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params;
    const result = await saveDraft(
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
