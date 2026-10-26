import { NextResponse, type NextRequest } from "next/server";
import {
  STUDIO_HANDOFF_SKIP_COOKIE,
  studioPublicHref,
  teachcodeLearnHref,
} from "@/lib/teachcode-public";

const CMS_COOKIE = "teachcode_cms_session";

function sameHost(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const host = request.headers.get("host");
  if (host) {
    url.host = host;
    if (!host.includes(":")) url.port = "";
  }
  return url;
}

function authHandoff(request: NextRequest, nextPath: string) {
  const href = studioPublicHref(
    "/api/auth/teachcode",
    `next=${encodeURIComponent(nextPath)}`,
  );
  if (href) return NextResponse.redirect(href);
  const url = sameHost(request, "/api/auth/teachcode");
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url);
}

function loginOnThisHost(request: NextRequest) {
  return NextResponse.redirect(sameHost(request, "/login"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(CMS_COOKIE)?.value);
  const handoff = Boolean(teachcodeLearnHref());
  if (pathname === "/login") {
    if (
      !handoff ||
      signedIn ||
      request.cookies.get(STUDIO_HANDOFF_SKIP_COOKIE)?.value
    ) {
      return NextResponse.next();
    }
    return authHandoff(request, "/courses");
  }
  if ((pathname === "/courses" || pathname.startsWith("/courses/")) && !signedIn) {
    if (!handoff) return loginOnThisHost(request);
    return authHandoff(request, pathname);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/courses", "/courses/:path*"],
};
