import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { apiError, sameOrigin } from "@/lib/api";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const p = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(1024),
      })
      .parse(await req.json());
    const result = await login(p.email, p.password);
    if (result === "ok") return NextResponse.json({ ok: true });
    if (result === "password_change") {
      return NextResponse.json(
        { error: "Change your TeachCode password, then sign in to Studio." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Invalid email, password, or CMS role" },
      { status: 401 },
    );
  } catch (e) {
    return apiError(e);
  }
}
