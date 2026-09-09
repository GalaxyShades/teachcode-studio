import { NextResponse } from "next/server";
import { getCourse } from "@/lib/cms";
import { updateCourse } from "@/lib/management";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    return NextResponse.json(await getCourse((await params).courseId));
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    await updateCourse((await params).courseId, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
