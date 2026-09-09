import { NextResponse } from "next/server";
import { reorder } from "@/lib/management";
import { apiError, sameOrigin } from "@/lib/api";
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    sameOrigin(req);
    await reorder((await params).courseId, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
