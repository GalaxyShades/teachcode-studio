import { NextResponse } from "next/server";
import {
  managedCoursesForEmail,
  managementRequestAllowed,
} from "@/lib/management-access";

export async function GET(req: Request) {
  if (!managementRequestAllowed(req)) {
    return NextResponse.json({ courses: [] });
  }
  const email = req.headers.get("x-teachcode-user-email") || "";
  const role = req.headers.get("x-teachcode-user-role") || "";
  const courses = await managedCoursesForEmail(email, role);
  return NextResponse.json(
    { courses },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
