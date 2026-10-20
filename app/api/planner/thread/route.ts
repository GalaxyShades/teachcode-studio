import { NextResponse } from "next/server";
import { apiError, sameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clearPlannerThread, plannerThread } from "@/lib/planner/store";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await plannerThread(user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    await clearPlannerThread(user.id);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
