import { NextResponse } from "next/server";
import { managementDenial, setManagedCourseTeacher } from "@/lib/management-access";

type Context = { params: Promise<{ courseId: string }> };

export async function PUT(req: Request, { params }: Context) {
  const denial = managementDenial(req);
  if (denial) {
    return NextResponse.json(
      { error: denial === 401 ? "Unauthorized" : "Not found" },
      { status: denial, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { courseId } = await params;
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    assigned?: unknown;
    role?: unknown;
  } | null;
  const role = body?.role === "owner" || body?.role === "editor" ? body.role : null;
  if (!role) {
    return NextResponse.json(
      { error: "Choose owner or editor" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await setManagedCourseTeacher({
    claimedRole: req.headers.get("x-teachcode-user-role") || "",
    claimedEmail: req.headers.get("x-teachcode-user-email") || "",
    courseId,
    staffEmail: typeof body?.email === "string" ? body.email : "",
    assigned: body?.assigned === true,
    role,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
