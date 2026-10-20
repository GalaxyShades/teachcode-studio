import { NextResponse, type NextRequest } from "next/server";
import { STUDIO_HANDOFF_SKIP_COOKIE } from "@/lib/teachcode-public";

const CMS_COOKIE = "teachcode_cms_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(CMS_COOKIE)?.value);
  if (pathname === "/login") {
    if (signedIn || request.cookies.get(STUDIO_HANDOFF_SKIP_COOKIE)?.value) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/teachcode";
    url.search = "";
    url.searchParams.set("next", "/courses");
    return NextResponse.redirect(url);
  }
  if ((pathname === "/courses" || pathname.startsWith("/courses/")) && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/teachcode";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/courses", "/courses/:path*"],
};
