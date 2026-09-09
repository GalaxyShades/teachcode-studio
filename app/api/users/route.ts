import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/cms";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json(
      (
        await db().query(
          "SELECT id,email,display_name FROM profiles WHERE role='staff' AND (lower(email) LIKE lower($1) OR lower(display_name) LIKE lower($1)) ORDER BY email LIMIT 50",
          ["%" + q.slice(0, 100) + "%"],
        )
      ).rows,
    );
  } catch (e) {
    return apiError(e);
  }
}
