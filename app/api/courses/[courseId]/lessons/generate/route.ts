import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCourse } from "@/lib/cms";
import { apiError, sameOrigin } from "@/lib/api";
import { db } from "@/lib/db";
import { insertGeneratedLesson } from "@/lib/generated-lesson";
import { completeLesson } from "@/lib/openrouter";
import { CmsError } from "@/lib/repository";
import { combineLessonSource, extractSourceText } from "@/lib/source-text";

type C = { params: Promise<{ courseId: string }> };

async function readGenerateSource(req: Request) {
  const type = req.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data")) {
    const { source } = z
      .object({ source: z.string().trim().min(1).max(80000) })
      .parse(await req.json());
    return source;
  }
  const form = await req.formData();
  const additional = String(form.get("additional") ?? "");
  const files = form
    .getAll("files")
    .filter((item): item is File => item instanceof File);
  if (!files.length && !additional.trim())
    throw new CmsError(400, "Add a source file, additional text, or both.");
  const texts: string[] = [];
  for (const file of files) {
    if (file.size > 8_000_000)
      throw new CmsError(
        400,
        `Could not read ${file.name || "file"}. The file is too large.`,
      );
    texts.push(
      await extractSourceText(
        file.name || "file",
        new Uint8Array(await file.arrayBuffer()),
      ),
    );
  }
  const source = combineLessonSource(texts, additional);
  if (!source.trim())
    throw new CmsError(400, "Add a source file, additional text, or both.");
  if (source.length > 80000)
    throw new CmsError(400, "The combined source is too long.");
  return source;
}

export async function POST(req: Request, { params }: C) {
  try {
    sameOrigin(req);
    const { courseId } = await params;
    const user = await requireCourse(courseId);
    const source = await readGenerateSource(req);
    const settings = (
      await db().query<{ api_key: string | null; model: string | null }>(
        "SELECT api_key, model FROM cms_openrouter_settings WHERE profile_id=$1",
        [user.id],
      )
    ).rows[0];
    if (!settings?.api_key)
      throw new CmsError(
        400,
        "Save an OpenRouter API key before creating a lesson.",
      );
    if (!settings.model)
      throw new CmsError(400, "Choose a model before creating a lesson.");
    const markdown = await completeLesson(
      settings.api_key,
      settings.model,
      source,
    );
    const lesson = await insertGeneratedLesson(courseId, user.id, markdown);
    return NextResponse.json(
      { id: lesson.id, title: lesson.title, slug: lesson.slug },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
