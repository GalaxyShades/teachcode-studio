import { NextResponse } from "next/server";
import { currentUser, logout } from "@/lib/auth";
import { apiError, sameOrigin } from "@/lib/api";
export async function GET() {
  try {
    return NextResponse.json(
      { user: await currentUser() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    await logout();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
