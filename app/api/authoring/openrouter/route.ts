import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, sameOrigin } from "@/lib/api";
import {
  clearOpenRouterKey,
  openRouterView,
  saveOpenRouterKey,
  saveOpenRouterModel,
} from "@/lib/openrouter";

const body = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(500)
      .refine((value) => !/\s/.test(value))
      .optional(),
    model: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => !/\s/.test(value))
      .optional(),
  })
  .refine((value) => value.apiKey || value.model, {
    message: "Provide an API key or a model",
  });

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const user = await requireUser();
    return noStore(await openRouterView(user.id));
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const input = body.parse(await req.json());
    if (input.apiKey) await saveOpenRouterKey(user.id, input.apiKey);
    if (input.model) await saveOpenRouterModel(user.id, input.model);
    return noStore(await openRouterView(user.id));
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    await clearOpenRouterKey(user.id);
    return noStore(await openRouterView(user.id));
  } catch (e) {
    return apiError(e);
  }
}
