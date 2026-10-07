import { NextResponse } from "next/server";
import { getDraft } from "@/lib/cms";
import { saveDraft } from "@/app/actions";
import { apiError, sameOrigin } from "@/lib/api";
import { AssistantSchema, LessonSchema } from "@/lib/content";
import { z } from "zod";
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
    const body = await req.json();
    const assistants = z
      .object({
        courseAssistant: AssistantSchema.optional(),
        lessonAssistant: AssistantSchema.optional(),
      })
      .parse(body);
    const result = await saveDraft(
      p.courseId,
      p.lessonId,
      LessonSchema.parse(body),
      assistants.lessonAssistant,
      assistants.courseAssistant,
    );
    return NextResponse.json(result, {
      status: "error" in result ? result.status : 200,
    });
  } catch (e) {
    return apiError(e);
  }
}
