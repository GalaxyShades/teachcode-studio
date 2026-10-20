import { NextResponse } from "next/server";
import { apiError, sameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  addPlannerAttachment,
  deletePlannerAttachment,
} from "@/lib/planner/store";
import { CmsError } from "@/lib/repository";
import { extractSourceText } from "@/lib/source-text";

const MAX_BYTES = 8_000_000;

function filenameOf(name: string) {
  const base = name.trim().split(/[/\\]/).pop() || "file";
  return base.slice(0, 200);
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new CmsError(400, "Choose a file to attach.");
    const filename = filenameOf(file.name);
    if (file.size > MAX_BYTES)
      throw new CmsError(
        400,
        `Could not read ${filename}. The file is too large.`,
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractSourceText(filename, bytes);
    } catch (error) {
      if (
        error instanceof CmsError &&
        /no selectable text/i.test(error.message)
      ) {
        return NextResponse.json(
          { warning: error.message },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw error;
    }
    const saved = await addPlannerAttachment(user.id, filename, text);
    return NextResponse.json(
      { id: saved.id, filename: saved.filename },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    if (!id) throw new CmsError(400, "Choose an attachment to remove.");
    await deletePlannerAttachment(user.id, id);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
