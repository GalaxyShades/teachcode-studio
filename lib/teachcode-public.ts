/** Student-app session cookie. Path is `/`, so Studio on the same site receives it. */
export const TEACHCODE_SESSION_COOKIE = "teachcode_session";

/** Stops the login page from immediately trying the TeachCode session again. */
export const STUDIO_HANDOFF_SKIP_COOKIE = "teachcode_studio_skip";

function httpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Student Courses page. `TEACHCODE_PUBLIC_URL` wins.
 * Otherwise `APP_URL` ending in `/studio` drops that prefix.
 */
export function teachcodeLearnHref(): string | null {
  const override = process.env.TEACHCODE_PUBLIC_URL?.trim();
  const app = process.env.APP_URL?.trim();
  const url = override ? httpUrl(override) : app ? httpUrl(app) : null;
  if (!url) return null;
  if (!override) {
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/studio")) return null;
  }
  url.pathname = "/learn";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function teachcodePasswordHref(): string | null {
  const learn = teachcodeLearnHref();
  if (!learn) return null;
  const url = new URL(learn);
  url.pathname = "/account/password";
  return url.toString();
}

/**
 * Absolute Studio URL for redirects. `next start -H 127.0.0.1` otherwise
 * sends the browser to localhost:3010.
 */
export function studioPublicHref(path: string, search = ""): string | null {
  const app = process.env.APP_URL?.trim();
  const base = app ? httpUrl(app) : null;
  if (!base) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const basePath = base.pathname.replace(/\/$/, "");
  base.pathname = `${basePath}${path}`;
  base.search = search.replace(/^\?/, "");
  base.hash = "";
  return base.toString();
}

/** Same-site Studio path under `/courses` only. */
export function safeCoursesPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/courses") || raw.startsWith("//")) return "/courses";
  if (raw.includes("\\") || raw.includes("://")) return "/courses";
  const path = raw.split(/[?#]/)[0] ?? "/courses";
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "courses") return "/courses";
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[\w.-]+$/.test(segment),
    )
  ) {
    return "/courses";
  }
  return `/${segments.join("/")}`;
}
