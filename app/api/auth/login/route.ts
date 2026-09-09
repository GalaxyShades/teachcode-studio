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
    return (await login(p.email, p.password))
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "Invalid email, password, or CMS role" },
          { status: 401 },
        );
  } catch (e) {
    return apiError(e);
  }
}
