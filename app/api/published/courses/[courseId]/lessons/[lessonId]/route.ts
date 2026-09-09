import { NextResponse } from "next/server";
import { publishedLesson } from "@/lib/repository";
import { apiError, cors } from "@/lib/api";
type C = { params: Promise<{ courseId: string; lessonId: string }> };
export async function GET(req: Request, { params }: C) {
  try {
    const p = await params;
    return NextResponse.json(await publishedLesson(p.courseId, p.lessonId), {
      headers: cors(req),
    });
  } catch (e) {
    const response = apiError(e);
    Object.entries(cors(req)).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
