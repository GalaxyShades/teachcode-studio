import { NextResponse } from "next/server";
import { publishedCourse } from "@/lib/published-catalog";
import { apiError, cors } from "@/lib/api";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    return NextResponse.json(await publishedCourse((await params).courseId), {
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
