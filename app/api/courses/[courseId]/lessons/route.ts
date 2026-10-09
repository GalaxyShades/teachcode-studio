import { NextResponse } from "next/server";
import { createLesson, getCourse } from "@/lib/cms";
import { apiError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";
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
    const text = await req.text();
    const body = z
      .object({
        chapterId: z.string().nullable().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        id: z.string().uuid().optional(),
      })
      .parse(text ? JSON.parse(text) : {});
    const id = await createLesson(
      (await params).courseId,
      body.chapterId,
      body.title,
      body.id,
    );
    const saved = (
      await db().query("SELECT slug, status, title FROM cms_lessons WHERE id=$1", [
        id,
      ])
    ).rows[0];
    return NextResponse.json(
      { id, slug: saved?.slug, status: saved?.status, title: saved?.title },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
