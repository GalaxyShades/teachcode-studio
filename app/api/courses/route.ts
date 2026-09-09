import { NextResponse } from "next/server";
import { z } from "zod";
import { coursesForUser, createCourse } from "@/lib/cms";
import { requireUser } from "@/lib/auth";
import { apiError, sameOrigin } from "@/lib/api";
export async function GET() {
  try {
    return NextResponse.json(await coursesForUser(await requireUser()));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const p = z
      .object({
        title: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        description: z.string().default(""),
      })
      .parse(await req.json());
    const form = new FormData();
    Object.entries(p).forEach(([k, v]) => form.set(k, v));
    return NextResponse.json({ id: await createCourse(form) }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
