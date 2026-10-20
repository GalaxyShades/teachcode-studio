import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

/** Clears the Studio session. TeachCode sign-out calls this so the cookie does not linger. */
export async function POST() {
  await logout();
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
