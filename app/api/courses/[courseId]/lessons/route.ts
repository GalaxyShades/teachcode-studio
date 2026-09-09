import { NextResponse } from "next/server";
import { createLesson, getCourse } from "@/lib/cms";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    return NextResponse.json(
      (await getCourse((await params).courseId)).lessons,
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    return NextResponse.json(
      { id: await createLesson((await params).courseId) },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
