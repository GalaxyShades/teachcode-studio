import { NextResponse } from "next/server";
import { z } from "zod";
import { cors } from "./api";
import { CmsError } from "./repository";
import { CONTENT_API_VERSION } from "./public-contract";

export function validatePublicIds(...ids: string[]) {
  if (ids.some((id) => !z.string().uuid().safeParse(id).success))
    throw new CmsError(400, "Course and chapter IDs must be UUIDs, not slugs.");
}
export function publicHeaders(req: Request) {
  return {
    ...cors(req),
    "X-Content-API-Version": String(CONTENT_API_VERSION),
    "Access-Control-Expose-Headers": "X-Content-API-Version",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "X-Content-Type-Options": "nosniff",
  };
}
export async function publicResponse(
  req: Request,
  read: () => Promise<unknown>,
) {
  try {
    return NextResponse.json(await read(), { headers: publicHeaders(req) });
  } catch (e) {
    const status =
      e instanceof CmsError && [400, 404].includes(e.status) ? e.status : 500;
    if (status === 500) console.error("Published content API failed", e);
    return NextResponse.json(
      {
        error:
          status === 400
            ? "Course and chapter IDs must be UUIDs, not slugs."
            : status === 404
              ? "Published content not found"
              : "Unable to load published content. Please retry later.",
        code:
          status === 400
            ? "INVALID_ID"
            : status === 404
              ? "PUBLISHED_CONTENT_NOT_FOUND"
              : "INTERNAL_ERROR",
      },
      { status, headers: publicHeaders(req) },
    );
  }
}
export function publicOptions(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicHeaders(req) });
}
