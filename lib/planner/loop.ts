import type { User } from "../auth";
import { canAccess } from "../cms";
import { db } from "../db";
import { completePlannerTurn, type PlannerModelMessage } from "../openrouter";
import { plannerSystemPrompt } from "./prompt";
import { readMessageAttachments } from "./message-text";
import { plannerWriteChange, type PlannerContentChange } from "./events";
import {
  plannerToolSchemas,
  runPlannerTool,
  type PlannerToolContext,
} from "./tools";
import { createValidationGate } from "./gate";

export const PLANNER_MAX_ROUNDS = 12;

export type PlannerLink = { href: string; title: string };

export type PlannerEvent =
  | { type: "status"; text: string }
  | { type: "changed"; change: PlannerContentChange }
  | { type: "reply"; text: string; links: PlannerLink[] };

const statusLine: Record<string, string> = {
  list_courses: "Looking through courses…",
  read_lesson: "Reading lesson…",
  read_attachment: "Reading attachment…",
  validate_lesson: "Validating lesson…",
  create_lesson: "Creating lesson…",
  update_lesson: "Updating lesson…",
  create_chapter: "Creating chapter…",
  move_lesson: "Moving lesson…",
};

export function withLessonLinks(text: string, links: PlannerLink[]) {
  let body = text.trim();
  for (const link of links) {
    if (body.includes(link.href)) continue;
    const label = link.title.trim() || "lesson";
    const line = `[Open ${label}](${link.href})`;
    body = body ? `${body}\n\n${line}` : line;
  }
  return body;
}

export async function plannerPageNote(
  user: User,
  path: string,
  attachments: { id: string; filename: string }[],
) {
  const clean = (path || "/courses").split("?")[0].split("#")[0] || "/courses";
  const lines = [`Current page: ${clean}`];
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "courses" && parts[1] && parts[1] !== "new") {
    const course = (
      await db().query<{ id: string; slug: string; title: string }>(
        "SELECT id, slug, title FROM cms_courses WHERE CAST(id AS TEXT)=$1 OR slug=$1 ORDER BY CASE WHEN CAST(id AS TEXT)=$1 THEN 0 ELSE 1 END LIMIT 1",
        [parts[1]],
      )
    ).rows[0];
    if (course && (await canAccess(course.id, user))) {
      lines.push(
        `Course on screen: ${course.title} (id ${course.id}, slug ${course.slug}).`,
      );
      if (parts[2] === "lessons" && parts[3] && parts[3] !== "new") {
        const lesson = (
          await db().query<{ id: string; slug: string; title: string }>(
            "SELECT id, slug, title FROM cms_lessons WHERE course_id=$1 AND (CAST(id AS TEXT)=$2 OR slug=$2) ORDER BY CASE WHEN CAST(id AS TEXT)=$2 THEN 0 ELSE 1 END LIMIT 1",
            [course.id, parts[3]],
          )
        ).rows[0];
        if (lesson)
          lines.push(
            `Lesson on screen: ${lesson.title} (id ${lesson.id}, slug ${lesson.slug}).`,
          );
      }
    }
  }
  if (attachments.length)
    lines.push(
      "Attachments in this chat: " +
        attachments
          .map((file) => `${file.filename} (id ${file.id})`)
          .join(", ") +
        ". Call read_attachment to use one. Their text is not included here.",
    );
  else lines.push("No attachments in this chat.");
  return lines.join("\n");
}

export async function* runPlannerLoop(options: {
  user: User;
  threadId: string;
  path: string;
  attachments: { id: string; filename: string }[];
  history: { role: "user" | "assistant"; content: string }[];
  apiKey: string;
  model: string;
  maxRounds?: number;
  timeoutMs?: number;
}): AsyncGenerator<PlannerEvent> {
  const ctx: PlannerToolContext = {
    user: options.user,
    threadId: options.threadId,
    gate: createValidationGate(),
    seenVersions: new Map(),
  };
  const note = await plannerPageNote(
    options.user,
    options.path,
    options.attachments,
  );
  const messages: PlannerModelMessage[] = [
    { role: "system", content: `${plannerSystemPrompt()}\n\n${note}` },
    ...options.history.slice(-40).map((message) => ({
      role: message.role,
      content:
        message.role === "user"
          ? readMessageAttachments(message.content).content
          : message.content,
    })),
  ];
  const links: PlannerLink[] = [];
  const rounds = options.maxRounds ?? PLANNER_MAX_ROUNDS;
  for (let round = 0; round < rounds; round++) {
    const completion = await completePlannerTurn(
      options.apiKey,
      options.model,
      messages,
      plannerToolSchemas,
      options.timeoutMs,
    );
    if (!completion.toolCalls.length) {
      const text = withLessonLinks(completion.content, links);
      yield {
        type: "reply",
        text: text || "I could not produce a reply. Try again.",
        links,
      };
      return;
    }
    messages.push({
      role: "assistant",
      content: completion.content || null,
      tool_calls: completion.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    for (const call of completion.toolCalls) {
      yield { type: "status", text: statusLine[call.name] ?? "Working…" };
      let parsed: unknown = {};
      try {
        parsed = call.arguments.trim() ? JSON.parse(call.arguments) : {};
      } catch {
        parsed = call.arguments;
      }
      const result = await runPlannerTool(call.name, parsed, ctx);
      const href =
        "href" in result && typeof result.href === "string" ? result.href : "";
      const title =
        "title" in result && typeof result.title === "string"
          ? result.title
          : "lesson";
      if (
        result.ok === true &&
        href &&
        (call.name === "create_lesson" || call.name === "update_lesson")
      )
        links.push({ href, title });
      const change = plannerWriteChange(call.name, result);
      if (change) yield { type: "changed", change };
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  yield {
    type: "reply",
    text: withLessonLinks(
      "I paused after several steps. Tell me if you want me to continue.",
      links,
    ),
    links,
  };
}
