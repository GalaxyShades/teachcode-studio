import { publishedCourse } from "@/lib/published-catalog";
import {
  publicResponse,
  publicOptions,
  validatePublicIds,
} from "@/lib/public-api";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return publicResponse(req, async () => {
    const p = await params;
    validatePublicIds(p.courseId);
    return publishedCourse(p.courseId);
  });
}
export const OPTIONS = publicOptions;
