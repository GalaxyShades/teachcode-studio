import { publishedCourses } from "@/lib/published-catalog";
import { publicResponse, publicOptions } from "@/lib/public-api";
export async function GET(req: Request) {
  return publicResponse(req, async () => {
    return publishedCourses();
  });
}
export const OPTIONS = publicOptions;
