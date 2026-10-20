import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CmsError } from "./repository";
export function apiError(e: unknown) {
  if (e instanceof CmsError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: "Invalid input", issues: e.issues },
      { status: 400 },
    );
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const code = (e as any)?.code;
  if (
    code === "23505" ||
    String((e as any)?.message).includes("UNIQUE constraint")
  )
    return NextResponse.json(
      { error: "This slug or position is already in use" },
      { status: 409 },
    );
  console.error(e);
  return NextResponse.json(
    { error: "Database or server error; check server logs" },
    { status: 500 },
  );
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(req.url);
  // Next normalizes loopback URLs to localhost; the browser retains the Host
  // it actually connected to (for example 127.0.0.1:3100).
  const host = req.headers.get("host");
  if (host) {
    expected.host = host;
    // Node keeps the internal port (3010) when the public Host header has none.
    if (!host.includes(":")) expected.port = "";
  }
  // nginx terminates TLS and forwards plain HTTP. The browser Origin stays https.
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "https" || forwarded === "http") {
    expected.protocol = `${forwarded}:`;
  }
  if (origin && origin !== expected.origin)
    throw new CmsError(403, "Cross-origin mutations are not allowed");
}
export function cors(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = (process.env.ALLOWED_CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim());
  return {
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origin && allowed.includes(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        }
      : {}),
  };
}
