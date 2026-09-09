import { NextResponse } from "next/server";
import { z } from "zod";
import { getCourse } from "@/lib/cms";
import { editModule, deleteModule } from "@/lib/management";
import { apiError, sameOrigin } from "@/lib/api";
type C = { params: Promise<{ courseId: string }> };
export async function GET(_: Request, { params }: C) {
  try {
    return NextResponse.json(
      (await getCourse((await params).courseId)).modules,
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    await editModule((await params).courseId, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const p = z.object({ id: z.string() }).parse(await req.json());
    await deleteModule((await params).courseId, p.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
