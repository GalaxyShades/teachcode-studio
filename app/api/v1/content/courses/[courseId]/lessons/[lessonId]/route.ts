import { PublicLessonSchema } from "@/lib/public-contract";
import { publishedLesson } from "@/lib/repository";
import {
  publicResponse,
  publicOptions,
  validatePublicIds,
} from "@/lib/public-api";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  return publicResponse(req, async () => {
    const p = await params;
    validatePublicIds(p.courseId, p.lessonId);
    return PublicLessonSchema.parse(
      await publishedLesson(p.courseId, p.lessonId),
    );
  });
}
export const OPTIONS = publicOptions;
