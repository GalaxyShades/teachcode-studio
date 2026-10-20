import { NextResponse, type NextRequest } from "next/server";
import {
  CMS_SESSION_COOKIE,
  cmsCookiePath,
  cmsSessionCookieOptions,
  issueCmsSession,
} from "@/lib/auth";
import {
  safeCoursesPath,
  STUDIO_HANDOFF_SKIP_COOKIE,
  TEACHCODE_SESSION_COOKIE,
  teachcodePasswordHref,
} from "@/lib/teachcode-public";
import { teachCodeIdentity, upsertStudioProfile } from "@/lib/teachcode-session";

function studioPath(req: NextRequest, path: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return url;
}

function loginRedirect(req: NextRequest) {
  const response = NextResponse.redirect(studioPath(req, "/login"));
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: cmsCookiePath(),
  };
  response.cookies.set(STUDIO_HANDOFF_SKIP_COOKIE, "1", { ...cookieOptions, maxAge: 120 });
  response.cookies.set(CMS_SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}

export async function GET(req: NextRequest) {
  const nextPath = safeCoursesPath(req.nextUrl.searchParams.get("next"));
  const token = req.cookies.get(TEACHCODE_SESSION_COOKIE)?.value ?? "";
  const identity = token ? await teachCodeIdentity(token) : null;
  if (!identity) return loginRedirect(req);
  if (
    identity.mustChangePassword &&
    (identity.role === "admin" || identity.role === "staff")
  ) {
    const passwordHref = teachcodePasswordHref();
    if (passwordHref) return NextResponse.redirect(passwordHref);
    return loginRedirect(req);
  }
  if (identity.role !== "admin" && identity.role !== "staff") return loginRedirect(req);
  try {
    const user = await upsertStudioProfile({
      email: identity.email,
      displayName: identity.displayName,
      role: identity.role,
    });
    const session = await issueCmsSession(user);
    const response = NextResponse.redirect(studioPath(req, nextPath));
    response.cookies.set(CMS_SESSION_COOKIE, session, cmsSessionCookieOptions());
    response.cookies.set(STUDIO_HANDOFF_SKIP_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.APP_URL ?? "").startsWith("https://"),
      path: cmsCookiePath(),
      maxAge: 0,
    });
    return response;
  } catch {
    return loginRedirect(req);
  }
}
