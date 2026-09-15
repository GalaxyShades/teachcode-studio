import { PublicChapterSchema } from "@/lib/public-contract";
import { publishedLesson } from "@/lib/repository";
import {
  publicResponse,
  publicOptions,
  validatePublicIds,
} from "@/lib/public-api";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string; chapterId: string }> },
) {
  return publicResponse(req, async () => {
    const p = await params;
    validatePublicIds(p.courseId, p.chapterId);
    return PublicChapterSchema.parse(await publishedLesson(p.courseId, p.chapterId));
  });
}
export const OPTIONS = publicOptions;
