import { NextResponse } from "next/server";
import { requireAdmin, getCourse } from "@/lib/cms";
import { assignStaff } from "@/lib/management";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    const p = await params;
    await requireAdmin(p.courseId);
    return NextResponse.json((await getCourse(p.courseId)).staff);
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    await assignStaff((await params).courseId, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
