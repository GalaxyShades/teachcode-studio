import { NextResponse } from "next/server";
import {
  managedCoursesForEmail,
  managementDenial,
} from "@/lib/management-access";

export async function GET(req: Request) {
  const denial = managementDenial(req);
  if (denial) {
    return NextResponse.json(
      { error: denial === 401 ? "Unauthorized" : "Not found" },
      {
        status: denial,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  }
  const email = req.headers.get("x-teachcode-user-email") || "";
  const role = req.headers.get("x-teachcode-user-role") || "";
  const courses = await managedCoursesForEmail(email, role);
  return NextResponse.json(
    { courses },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
