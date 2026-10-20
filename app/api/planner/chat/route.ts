import { z } from "zod";
import { apiError, sameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  lessonModelForCall,
  redactSecret,
  savedOpenRouterCredentials,
} from "@/lib/openrouter";
import { runPlannerLoop } from "@/lib/planner/loop";
import {
  appendPlannerMessage,
  ensurePlannerThread,
  listPlannerAttachments,
  listPlannerMessages,
} from "@/lib/planner/store";
import { CmsError } from "@/lib/repository";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  path: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const body = bodySchema.parse(await req.json());
    const saved = await savedOpenRouterCredentials(user.id);
    const { apiKey } = saved;
    const model = lessonModelForCall(saved.model);
    if (!apiKey)
      throw new CmsError(
        400,
        "Save an OpenRouter API key before using the course planner.",
      );
    if (!model)
      throw new CmsError(
        400,
        "Choose a model before using the course planner.",
      );
    const threadId = await ensurePlannerThread(user.id);
    await appendPlannerMessage(threadId, "user", body.message);
    const history = await listPlannerMessages(threadId);
    const attachments = await listPlannerAttachments(threadId);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        let reply = "";
        try {
          for await (const event of runPlannerLoop({
            user,
            threadId,
            path: body.path ?? "",
            attachments,
            history,
            apiKey,
            model,
          })) {
            if (event.type === "reply") reply = event.text;
            send(event);
          }
          if (reply) await appendPlannerMessage(threadId, "assistant", reply);
        } catch (error) {
          const message =
            error instanceof CmsError
              ? error.message
              : "The course planner could not finish.";
          send({ type: "error", error: redactSecret(message, apiKey) });
        } finally {
          try {
            controller.close();
          } catch {
            /* The client may already have closed the stream. */
          }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
