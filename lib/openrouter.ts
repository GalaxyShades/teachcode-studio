import crypto from "node:crypto";
import { authoringResources } from "./authoring-resources";
import { blockTypes } from "./content";
import { db } from "./db";
import { CmsError } from "./repository";

const APP_TITLE = "TeachCode Content Studio";
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterModel = { id: string; name: string };
export type OpenRouterView = {
  hasKey: boolean;
  model: string | null;
  models: OpenRouterModel[];
  /** The signed-in owner's own key, so the password field can show it masked. */
  apiKey?: string;
  error?: string;
};

function headers(apiKey: string) {
  const result: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-Title": APP_TITLE,
  };
  if (process.env.APP_URL) result["HTTP-Referer"] = process.env.APP_URL;
  return result;
}

export function redactSecret(message: string, secret: string) {
  if (!secret || !message.includes(secret)) return message;
  return message.split(secret).join("a saved key");
}

export function authoringRequest(source: string) {
  const { prompt } = authoringResources();
  const marker = "SOURCE DOCUMENT / SLIDE CONTENT:\n";
  const index = prompt.lastIndexOf(marker);
  const body = source.trim();
  if (index === -1) return `${prompt}\n\n${body}`;
  return prompt.slice(0, index + marker.length) + body;
}

/**
 * A new lesson or step is a sibling, never a child. Small models often omit
 * the closing line, which makes the next step look nested.
 */
export function balanceLessonDirectives(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const stack: string[] = [];
  let fence = "";
  const closeOpen = () => {
    while (stack.length) {
      stack.pop();
      out.push(":::");
    }
  };
  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = "";
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }
    if (line === ":::") {
      if (stack.length) stack.pop();
      out.push(line);
      continue;
    }
    const open = /^:::([\w-]+)(?:\{(.*)\})?$/.exec(line);
    if (open) {
      const name = open[1];
      if (name === "lesson" || name === "step") closeOpen();
      else if ((blockTypes as readonly string[]).includes(name)) {
        while (stack.length && stack[stack.length - 1] !== "step") {
          stack.pop();
          out.push(":::");
        }
      }
      stack.push(name);
      out.push(line);
      continue;
    }
    out.push(line);
  }
  closeOpen();
  return out.join("\n");
}

/** Drop a wrapping fence or a short preamble so the parser sees the lesson. */
export function lessonMarkdownFromModel(content: string) {
  let text = content.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.search(/^:::lesson\b/m);
  if (start > 0) text = text.slice(start);
  return balanceLessonDirectives(text);
}

/** Chat models that returned usable lesson Markdown from a short source. */
export const lessonWritingModelIds = [
  "qwen/qwen3.7-max",
  "x-ai/grok-4.7",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-5.5",
] as const;

/** GLM ids return empty planner replies, so they are never offered or called. */
export function isGlmModelId(id: string) {
  return /glm/i.test(id);
}

/**
 * Teachers and the planner use this when the saved id is a GLM model.
 * The saved key is not changed.
 */
export function lessonModelForCall(model: string | null) {
  if (model && isGlmModelId(model)) return lessonWritingModelIds[0];
  return model;
}

export function lessonWritingModels(models: OpenRouterModel[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return lessonWritingModelIds.flatMap((id) => {
    if (isGlmModelId(id)) return [];
    const model = byId.get(id);
    if (!model || isGlmModelId(model.id)) return [];
    return [model];
  });
}

export function readableModels(
  models: OpenRouterModel[],
  selected: string | null,
) {
  const byId = new Map<string, OpenRouterModel>();
  for (const model of models) {
    if (!model.id || !model.name || byId.has(model.id)) continue;
    byId.set(model.id, { id: model.id, name: model.name });
  }
  const list = [...byId.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  if (selected && !byId.has(selected))
    list.unshift({ id: selected, name: selected });
  return list;
}

async function readRow(userId: string) {
  const row = (
    await db().query<{ api_key: string | null; model: string | null }>(
      "SELECT api_key, model FROM cms_openrouter_settings WHERE profile_id=$1",
      [userId],
    )
  ).rows[0];
  return {
    apiKey: row?.api_key || null,
    model: row?.model || null,
  };
}

export async function saveOpenRouterKey(userId: string, apiKey: string) {
  await db().query(
    "INSERT INTO cms_openrouter_settings(profile_id, api_key) VALUES($1,$2) ON CONFLICT(profile_id) DO UPDATE SET api_key=excluded.api_key",
    [userId, apiKey],
  );
}

export async function saveOpenRouterModel(userId: string, model: string) {
  await db().query(
    "INSERT INTO cms_openrouter_settings(profile_id, model) VALUES($1,$2) ON CONFLICT(profile_id) DO UPDATE SET model=excluded.model",
    [userId, model],
  );
}

export async function clearOpenRouterKey(userId: string) {
  await db().query(
    "UPDATE cms_openrouter_settings SET api_key=NULL WHERE profile_id=$1",
    [userId],
  );
}

/** The teacher's saved planner credentials. Does not call the one-shot lesson API. */
export async function savedOpenRouterCredentials(userId: string) {
  return readRow(userId);
}

export async function listOpenRouterModels(apiKey: string) {
  let response: Response;
  try {
    response = await fetch(MODELS_URL, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new CmsError(502, "Could not reach OpenRouter.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && payload.error?.message) ||
      "OpenRouter rejected the model list request.";
    throw new CmsError(502, redactSecret(String(message), apiKey));
  }
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .map((model: { id?: unknown; name?: unknown }) => ({
      id: typeof model?.id === "string" ? model.id : "",
      name: typeof model?.name === "string" ? model.name : "",
    }))
    .filter((model: OpenRouterModel) => model.id && model.name);
}

/**
 * Settings for the signed-in owner. Includes that owner's key so the password
 * field can show it masked. Error text is redacted and never includes the key.
 */
export async function openRouterView(userId: string): Promise<OpenRouterView> {
  const saved = await readRow(userId);
  const model = lessonModelForCall(saved.model);
  if (!saved.apiKey) return { hasKey: false, model, models: [] };
  try {
    const models = lessonWritingModels(
      await listOpenRouterModels(saved.apiKey),
    );
    return { hasKey: true, apiKey: saved.apiKey, model, models };
  } catch (e) {
    const message =
      e instanceof CmsError
        ? e.message
        : "Could not load models from OpenRouter.";
    return {
      hasKey: true,
      apiKey: saved.apiKey,
      model,
      models: [],
      error: redactSecret(message, saved.apiKey),
    };
  }
}

export async function completeLesson(
  apiKey: string,
  model: string,
  source: string,
) {
  let response: Response;
  try {
    response = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: authoringRequest(source) }],
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    throw new CmsError(
      502,
      redactSecret(
        e instanceof Error && e.name === "TimeoutError"
          ? "OpenRouter took too long to answer."
          : "Could not reach OpenRouter.",
        apiKey,
      ),
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && payload.error?.message) ||
      "OpenRouter rejected the request.";
    throw new CmsError(502, redactSecret(String(message), apiKey));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new CmsError(502, "OpenRouter returned an empty lesson.");
  return lessonMarkdownFromModel(content);
}

export type PlannerToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type PlannerModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};

function plannerText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      )
        return (part as { text: string }).text;
      return "";
    })
    .join("");
}

function plannerToolCalls(message: { tool_calls?: unknown }) {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const parsed: PlannerToolCall[] = [];
  for (const call of calls) {
    if (!call || typeof call !== "object") continue;
    const record = call as {
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    const name = record.function?.name ?? record.name;
    if (typeof name !== "string" || !name) continue;
    const raw = record.function?.arguments ?? record.arguments ?? "{}";
    parsed.push({
      id:
        typeof record.id === "string" && record.id
          ? record.id
          : crypto.randomBytes(8).toString("hex"),
      name,
      arguments: typeof raw === "string" ? raw : JSON.stringify(raw),
    });
  }
  return parsed;
}

/**
 * One planner turn with tool definitions. Separate from completeLesson.
 */
export async function completePlannerTurn(
  apiKey: string,
  model: string,
  messages: PlannerModelMessage[],
  tools: readonly unknown[],
  timeoutMs = 90000,
) {
  let response: Response;
  try {
    response = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: { ...headers(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((message) => {
          if (message.role === "tool")
            return {
              role: "tool",
              tool_call_id: message.tool_call_id,
              content: message.content ?? "",
            };
          const row: Record<string, unknown> = {
            role: message.role,
            content: message.content,
          };
          if (message.tool_calls?.length) row.tool_calls = message.tool_calls;
          return row;
        }),
        tools,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new CmsError(
      502,
      redactSecret(
        e instanceof Error && e.name === "TimeoutError"
          ? "OpenRouter took too long to answer."
          : "Could not reach OpenRouter.",
        apiKey,
      ),
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && payload.error?.message) ||
      "OpenRouter rejected the request.";
    throw new CmsError(502, redactSecret(String(message), apiKey));
  }
  const message = payload?.choices?.[0]?.message ?? {};
  const content = plannerText(message.content);
  const toolCalls = plannerToolCalls(message);
  if (!content.trim() && !toolCalls.length)
    throw new CmsError(502, "OpenRouter returned an empty planner reply.");
  return { content, toolCalls };
}
