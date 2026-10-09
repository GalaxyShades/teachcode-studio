import { NextResponse } from "next/server";
import { requireCourse } from "@/lib/cms";
import { apiError, sameOrigin } from "@/lib/api";
import { CmsError } from "@/lib/repository";
import { extractSourceText } from "@/lib/source-text";

type C = { params: Promise<{ courseId: string }> };

function extension(name: string) {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1);
}

export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const { courseId } = await params;
    await requireCourse(courseId);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new CmsError(400, "Choose a PDF to check.");
    const name = file.name.trim() || "file";
    if (extension(name) !== "pdf")
      throw new CmsError(400, "Choose a PDF to check.");
    if (file.size > 8_000_000)
      throw new CmsError(
        400,
        `Could not read ${name}. The file is too large.`,
      );
    await extractSourceText(name, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
