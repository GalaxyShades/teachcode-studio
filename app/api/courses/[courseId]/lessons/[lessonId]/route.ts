import { NextResponse } from "next/server";
import { z } from "zod";
import { moveLesson } from "@/lib/management";
import { unpublishDraft } from "@/app/actions";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string; lessonId: string }> };
export async function PATCH(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params,
      body = z
        .object({ moduleId: z.string().nullable() })
        .parse(await req.json());
    await moveLesson(p.courseId, p.lessonId, body.moduleId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = await params;
    await unpublishDraft(p.courseId, p.lessonId, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
