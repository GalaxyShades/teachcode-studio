import crypto from "node:crypto";
import { db } from "../db";
import { CmsError } from "../repository";

export const PLANNER_ATTACHMENT_CHAR_LIMIT = 80_000;

export type PlannerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type PlannerAttachment = {
  id: string;
  filename: string;
};

async function threadIdFor(userId: string) {
  const row = (
    await db().query<{ id: string }>(
      "SELECT id FROM cms_planner_threads WHERE profile_id=$1",
      [userId],
    )
  ).rows[0];
  return row?.id ?? null;
}

export async function plannerThread(userId: string) {
  const threadId = await threadIdFor(userId);
  if (!threadId) return { messages: [], attachments: [] };
  const [messages, attachments] = await Promise.all([
    listPlannerMessages(threadId),
    listPlannerAttachments(threadId),
  ]);
  return { messages, attachments };
}

export async function ensurePlannerThread(userId: string) {
  const existing = await threadIdFor(userId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  try {
    await db().query(
      "INSERT INTO cms_planner_threads(id,profile_id) VALUES($1,$2)",
      [id, userId],
    );
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/UNIQUE/i.test(message)) throw error;
    const again = await threadIdFor(userId);
    if (again) return again;
    throw error;
  }
}

export async function clearPlannerThread(userId: string) {
  await db().query("DELETE FROM cms_planner_threads WHERE profile_id=$1", [
    userId,
  ]);
}

export async function listPlannerMessages(threadId: string) {
  return (
    await db().query<PlannerMessage>(
      "SELECT id, role, content FROM cms_planner_messages WHERE thread_id=$1 AND content<>'' ORDER BY position",
      [threadId],
    )
  ).rows;
}

export async function appendPlannerMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
) {
  const id = crypto.randomUUID();
  await db().transaction(async (client) => {
    const position = (
      await client.query<{ n: number }>(
        "SELECT coalesce(max(position),-1)+1 n FROM cms_planner_messages WHERE thread_id=$1",
        [threadId],
      )
    ).rows[0].n;
    await client.query(
      "INSERT INTO cms_planner_messages(id,thread_id,role,content,position) VALUES($1,$2,$3,$4,$5)",
      [id, threadId, role, content, position],
    );
    await client.query(
      "UPDATE cms_planner_threads SET updated_at=CURRENT_TIMESTAMP WHERE id=$1",
      [threadId],
    );
  });
  return id;
}

export async function listPlannerAttachments(threadId: string) {
  return (
    await db().query<PlannerAttachment>(
      "SELECT id, filename FROM cms_planner_attachments WHERE thread_id=$1 ORDER BY created_at, id",
      [threadId],
    )
  ).rows;
}

export async function attachmentText(threadId: string, attachmentId: string) {
  const row = (
    await db().query<{ extracted_text: string; filename: string }>(
      "SELECT extracted_text, filename FROM cms_planner_attachments WHERE id=$1 AND thread_id=$2",
      [attachmentId, threadId],
    )
  ).rows[0];
  return row ?? null;
}

export async function addPlannerAttachment(
  userId: string,
  filename: string,
  extractedText: string,
) {
  const threadId = await ensurePlannerThread(userId);
  const id = crypto.randomUUID();
  await db().transaction(async (client) => {
    const used = Number(
      (
        await client.query<{ n: number }>(
          "SELECT coalesce(sum(length(extracted_text)),0) n FROM cms_planner_attachments WHERE thread_id=$1",
          [threadId],
        )
      ).rows[0].n,
    );
    if (used + extractedText.length > PLANNER_ATTACHMENT_CHAR_LIMIT)
      throw new CmsError(
        400,
        "Attachments in this chat are limited to 80,000 characters combined.",
      );
    await client.query(
      "INSERT INTO cms_planner_attachments(id,thread_id,filename,extracted_text) VALUES($1,$2,$3,$4)",
      [id, threadId, filename, extractedText],
    );
  });
  return { id, filename, threadId };
}

export async function deletePlannerAttachment(
  userId: string,
  attachmentId: string,
) {
  await db().query(
    "DELETE FROM cms_planner_attachments WHERE id=$1 AND thread_id IN (SELECT id FROM cms_planner_threads WHERE profile_id=$2)",
    [attachmentId, userId],
  );
}
