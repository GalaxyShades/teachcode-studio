import { NextResponse, type NextRequest } from "next/server";
import { STUDIO_HANDOFF_SKIP_COOKIE, studioPublicHref } from "@/lib/teachcode-public";

const CMS_COOKIE = "teachcode_cms_session";

function authHandoff(request: NextRequest, nextPath: string) {
  const href = studioPublicHref(
    "/api/auth/teachcode",
    `next=${encodeURIComponent(nextPath)}`,
  );
  if (href) return NextResponse.redirect(href);
  const url = request.nextUrl.clone();
  url.pathname = "/api/auth/teachcode";
  url.search = "";
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(CMS_COOKIE)?.value);
  if (pathname === "/login") {
    if (signedIn || request.cookies.get(STUDIO_HANDOFF_SKIP_COOKIE)?.value) {
      return NextResponse.next();
    }
    return authHandoff(request, "/courses");
  }
  if ((pathname === "/courses" || pathname.startsWith("/courses/")) && !signedIn) {
    return authHandoff(request, pathname);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/courses", "/courses/:path*"],
};
