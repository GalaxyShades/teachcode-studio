import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { cookies } from "next/headers";
import { db } from "../lib/db";
import { migrate } from "../scripts/migrate";
import { defaults, type LessonDraft } from "../lib/content";
import { serializeLessonMarkdown } from "../lib/markdown";
import { lessonWritingModelIds } from "../lib/openrouter";
import { loadRevision, publishRevision } from "../lib/repository";
import {
  GET as settingsGet,
  PUT as settingsPut,
  DELETE as settingsDelete,
} from "../app/api/authoring/openrouter/route";
import { POST as generate } from "../app/api/courses/[courseId]/lessons/generate/route";
import { POST as pdfText } from "../app/api/courses/[courseId]/lessons/pdf-text/route";
import { GET as publicLesson } from "../app/api/v1/content/courses/[courseId]/lessons/[lessonId]/route";

const dir = mkdtempSync(join(tmpdir(), "teachcode-openrouter-"));
const admin = crypto.randomUUID();
const staff = crypto.randomUUID();
const outsider = crypto.randomUUID();
const courseId = crypto.randomUUID();
const secret = "sk-or-v1-test-secret-value-not-real";
const lessonMarkdown = serializeLessonMarkdown({
  title: "Generated sample",
  slug: "generated-sample",
  description: "A short generated sample.",
  track: "Python",
  programmingLanguage: "Python",
  tags: ["sample"],
  version: 0,
  steps: [
    {
      id: "step-one",
      title: "Step",
      blocks: [defaults.text()],
    },
  ],
} satisfies LessonDraft);
const sessions = {
  admin: crypto.randomBytes(16).toString("hex"),
  staff: crypto.randomBytes(16).toString("hex"),
  outsider: crypto.randomBytes(16).toString("hex"),
};

function asUser(token?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      token && name === "teachcode_cms_session" ? { value: token } : undefined,
  } as never);
}

function tinyPdf(text: string) {
  const stream = `BT /F1 18 Tf 36 100 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++)
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body);
}

function request(url: string, method: string, body?: unknown, origin?: string) {
  return new Request(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(origin ? { origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  process.env.DATABASE_MODE = "sqlite";
  process.env.SQLITE_DATABASE_PATH = join(dir, "test.db");
  process.env.APP_URL = "http://localhost:3000";
  new DatabaseSync(process.env.SQLITE_DATABASE_PATH).close();
  await migrate();
  for (const [id, email] of [
    [admin, "admin@hku.hk"],
    [staff, "staff@hku.hk"],
    [outsider, "other@hku.hk"],
  ] as const)
    await db().query(
      "INSERT INTO profiles(id,email,display_name,role,password_hash) VALUES($1,$2,$3,$4,$5)",
      [id, email, email, id === admin ? "admin" : "staff", "unused"],
    );
  await db().query(
    "INSERT INTO cms_courses(id,slug,title,created_by) VALUES($1,$2,$3,$4)",
    [courseId, "openrouter-course", "OpenRouter course", admin],
  );
  await db().query(
    "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3)",
    [courseId, staff, admin],
  );
  const expiry = new Date(Date.now() + 3600000).toISOString();
  for (const [userId, token] of [
    [admin, sessions.admin],
    [staff, sessions.staff],
    [outsider, sessions.outsider],
  ] as const)
    await db().query(
      "INSERT INTO auth_sessions(token,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)",
      [token, userId, new Date().toISOString(), expiry],
    );
});
afterAll(async () => {
  await db().end();
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  asUser();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(`unexpected network ${secret}`);
    }),
  );
});

describe("OpenRouter settings", () => {
  it("returns the owner's key only on their settings response", async () => {
    const anonymous = await settingsGet();
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({
      error: expect.stringMatching(/Sign in/),
    });
    expect(
      JSON.stringify(await settingsGet().then((r) => r.json())),
    ).not.toContain(secret);

    asUser(sessions.admin);
    const denied = await settingsPut(
      request(
        "http://localhost:3000/api/authoring/openrouter",
        "PUT",
        { apiKey: secret },
        "https://evil.example",
      ),
    );
    expect(denied.status).toBe(403);

    const saved = await settingsPut(
      request("http://localhost:3000/api/authoring/openrouter", "PUT", {
        apiKey: secret,
      }),
    );
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body).toMatchObject({
      hasKey: true,
      apiKey: secret,
      model: null,
      models: [],
      error: "Could not reach OpenRouter.",
    });
    expect(body.error).not.toContain(secret);
    expect(body.api_key).toBeUndefined();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain(secret);
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).not.toContain(
      secret,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toBe("https://openrouter.ai/api/v1/models");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${secret}`,
        );
        expect(new Headers(init?.headers).get("http-referer")).toBe(
          "http://localhost:3000",
        );
        expect(new Headers(init?.headers).get("x-title")).toBe(
          "TeachCode Content Studio",
        );
        return new Response(
          JSON.stringify({
            data: [
              ...lessonWritingModelIds.map((id) => ({
                id,
                name: id,
              })),
              {
                id: "openai/gpt-4o",
                name: "GPT-4o",
                pricing: { prompt: secret },
              },
              {
                id: "black-forest-labs/flux-pro",
                name: "Flux",
                description: "raw-provider-payload",
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const viewed = await (await settingsGet()).json();
    expect(viewed).toEqual({
      hasKey: true,
      apiKey: secret,
      model: null,
      models: lessonWritingModelIds.map((id) => ({ id, name: id })),
    });
    const { apiKey: ownerKey, ...viewedRest } = viewed;
    expect(ownerKey).toBe(secret);
    expect(JSON.stringify(viewedRest)).not.toContain(secret);
    expect(JSON.stringify(viewedRest)).not.toContain("raw-provider-payload");
    expect(JSON.stringify(viewedRest)).not.toContain("pricing");

    asUser(sessions.staff);
    const staffView = await (await settingsGet()).json();
    expect(staffView).toMatchObject({ hasKey: false, models: [] });
    expect(staffView.apiKey).toBeUndefined();
    expect(JSON.stringify(staffView)).not.toContain(secret);
    asUser(sessions.admin);

    const chosen = await (
      await settingsPut(
        request("http://localhost:3000/api/authoring/openrouter", "PUT", {
          model: "openai/gpt-4o",
        }),
      )
    ).json();
    expect(chosen.model).toBe("openai/gpt-4o");
    expect(chosen.apiKey).toBe(secret);
    const { apiKey: chosenKey, ...chosenRest } = chosen;
    expect(chosenKey).toBe(secret);
    expect(JSON.stringify(chosenRest)).not.toContain(secret);

    const removed = await (
      await settingsDelete(
        request("http://localhost:3000/api/authoring/openrouter", "DELETE"),
      )
    ).json();
    expect(removed).toMatchObject({
      hasKey: false,
      model: "openai/gpt-4o",
      models: [],
    });
    expect(removed.apiKey).toBeUndefined();
    expect(JSON.stringify(removed)).not.toContain(secret);
    const stored = (
      await db().query(
        "SELECT api_key FROM cms_openrouter_settings WHERE profile_id=$1",
        [admin],
      )
    ).rows[0];
    expect(stored.api_key).toBeNull();
  });

  it("rejects signed-out, unassigned, and keyless generation without calling OpenRouter", async () => {
    const calls = vi.mocked(fetch);
    const generateUrl = `http://localhost:3000/api/courses/${courseId}/lessons/generate`;
    const post = (body: unknown) =>
      generate(request(generateUrl, "POST", body), {
        params: Promise.resolve({ courseId }),
      });
    expect((await post({ source: "A short source." })).status).toBe(401);
    asUser(sessions.outsider);
    expect((await post({ source: "A short source." })).status).toBe(403);
    asUser(sessions.staff);
    const missing = await post({ source: "A short source." });
    expect(missing.status).toBe(400);
    const missingBody = await missing.json();
    expect(missingBody.error).toBe(
      "Save an OpenRouter API key before creating a lesson.",
    );
    expect(JSON.stringify(missingBody)).not.toContain(secret);
    expect(calls).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain(
      secret,
    );
  });

  it("creates a draft from model markdown and keeps the key and raw reply private", async () => {
    asUser(sessions.admin);
    await settingsPut(
      request("http://localhost:3000/api/authoring/openrouter", "PUT", {
        apiKey: secret,
        model: "openai/gpt-4o",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/models"))
          return new Response(
            JSON.stringify({ data: [{ id: "openai/gpt-4o", name: "GPT-4o" }] }),
            { status: 200 },
          );
        expect(String(url)).toBe(
          "https://openrouter.ai/api/v1/chat/completions",
        );
        const sent = JSON.parse(String(init?.body));
        expect(sent.model).toBe("openai/gpt-4o");
        expect(sent.messages[0].content).toContain(
          "Turn a source into one TeachCode lesson",
        );
        expect(sent.messages[0].content).toContain(
          "SOURCE DOCUMENT / SLIDE CONTENT:\nIntegers and floats",
        );
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${secret}`,
        );
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `INTERNAL MODEL NOTE ${secret}\n\n${lessonMarkdown}`,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const response = await generate(
      request(
        `http://localhost:3000/api/courses/${courseId}/lessons/generate`,
        "POST",
        {
          source: "Integers and floats",
        },
      ),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toEqual({
      id: expect.any(String),
      title: "Generated sample",
      slug: "generated-sample",
    });
    expect(JSON.stringify(created)).not.toContain(secret);
    expect(JSON.stringify(created)).not.toContain("INTERNAL MODEL NOTE");
    const row = (
      await db().query(
        "SELECT chapter_id, title, status FROM cms_lessons WHERE id=$1",
        [created.id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      chapter_id: null,
      title: "Generated sample",
      status: "draft",
    });
    const draft = await loadRevision(
      db(),
      { version: 0 },
      (
        await db().query(
          "SELECT draft_revision_id FROM cms_lessons WHERE id=$1",
          [created.id],
        )
      ).rows[0].draft_revision_id,
    );
    await publishRevision(
      courseId,
      created.id,
      { ...draft, version: 0 },
      admin,
    );
    const published = await publicLesson(
      new Request(
        `http://localhost:3000/api/v1/content/courses/${courseId}/lessons/${created.id}`,
      ),
      { params: Promise.resolve({ courseId, lessonId: created.id }) },
    );
    const publicBody = await published.json();
    expect(published.status).toBe(200);
    expect(JSON.stringify(publicBody)).not.toContain(secret);
    expect(JSON.stringify(publicBody)).not.toContain("INTERNAL MODEL NOTE");
    expect(publicBody.sourceMarkdown).toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "This is not a lesson." } }],
            }),
            { status: 200 },
          ),
      ),
    );
    const invalid = await generate(
      request(
        `http://localhost:3000/api/courses/${courseId}/lessons/generate`,
        "POST",
        {
          source: "Still not a lesson",
        },
      ),
      { params: Promise.resolve({ courseId }) },
    );
    expect(invalid.status).toBe(400);
    const invalidBody = await invalid.json();
    expect(invalidBody.error).toMatch(/Line /);
    expect(JSON.stringify(invalidBody)).not.toContain(secret);
    expect(JSON.stringify(invalidBody)).not.toContain("This is not a lesson.");
  });

  it("combines an uploaded text file with additional text in the model prompt", async () => {
    asUser(sessions.admin);
    await settingsPut(
      request("http://localhost:3000/api/authoring/openrouter", "PUT", {
        apiKey: secret,
        model: "openai/gpt-4o",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/models"))
          return new Response(
            JSON.stringify({ data: [{ id: "openai/gpt-4o", name: "GPT-4o" }] }),
            { status: 200 },
          );
        const sent = JSON.parse(String(init?.body));
        expect(sent.messages[0].content).toContain(
          "SOURCE DOCUMENT / SLIDE CONTENT:\nFrom the file\n\nTyped alongside",
        );
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: lessonMarkdown } }],
          }),
          { status: 200 },
        );
      }),
    );
    const form = new FormData();
    form.set("additional", "Typed alongside");
    form.append(
      "files",
      new File(["From the file"], "notes.txt", { type: "text/plain" }),
    );
    const response = await generate(
      new Request(
        `http://localhost:3000/api/courses/${courseId}/lessons/generate`,
        { method: "POST", body: form },
      ),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(201);
  });

  it("rejects a textless PDF before calling OpenRouter and checks it on upload", async () => {
    const calls = vi.mocked(fetch);
    const checkUrl = `http://localhost:3000/api/courses/${courseId}/lessons/pdf-text`;
    const scanName = "Parametric Estimation.pdf";
    const check = (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return pdfText(new Request(checkUrl, { method: "POST", body: form }), {
        params: Promise.resolve({ courseId }),
      });
    };
    const scan = () =>
      new File([tinyPdf("")], scanName, { type: "application/pdf" });

    expect((await check(scan())).status).toBe(401);
    expect(calls).not.toHaveBeenCalled();

    asUser(sessions.outsider);
    expect((await check(scan())).status).toBe(403);

    asUser(sessions.admin);
    const blocked = await check(scan());
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toBe(
      `${scanName} looks like a scan with no selectable text and cannot be used.`,
    );
    expect(
      (
        await check(
          new File([tinyPdf("Hello PDF")], "notes.pdf", {
            type: "application/pdf",
          }),
        )
      ).status,
    ).toBe(200);
    const plain = await check(
      new File(["From the file"], "notes.txt", { type: "text/plain" }),
    );
    expect(plain.status).toBe(400);
    expect((await plain.json()).error).toBe("Choose a PDF to check.");

    await settingsPut(
      request("http://localhost:3000/api/authoring/openrouter", "PUT", {
        apiKey: secret,
        model: "openai/gpt-4o",
      }),
    );
    calls.mockClear();
    const generateForm = new FormData();
    generateForm.append("files", scan());
    generateForm.append(
      "files",
      new File(["From the file"], "notes.txt", { type: "text/plain" }),
    );
    const response = await generate(
      new Request(
        `http://localhost:3000/api/courses/${courseId}/lessons/generate`,
        { method: "POST", body: generateForm },
      ),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      `${scanName} looks like a scan with no selectable text and cannot be used.`,
    );
    expect(calls).not.toHaveBeenCalled();
  });
});
