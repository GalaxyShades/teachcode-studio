import { test, expect } from "@playwright/test";
const course = "10000000-0000-4000-8000-000000000001",
  lesson = "30000000-0000-4000-8000-000000000001",
  base = `/api/courses/${course}/lessons/${lesson}`;
test("admin login, dashboard, normalized draft, publication, public preview and revocation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@hku.hk");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid" }),
  ).toContainText("Invalid");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/courses");
  await expect(
    page.getByRole("heading", { name: "Python Foundations" }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "Python Foundations" }).click();
  await page
    .locator(
      'a[href="/courses/python-foundations/lessons/component-reference/edit"]',
    )
    .click();
  await expect(
    page
      .getByRole("heading", { name: "Component reference", exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const source = await page.getByLabel("Lesson Markdown").inputValue();
  expect(source).toContain(":::code-exercise");
  await page.getByLabel("Lesson Markdown").fill(source + "\n:::bad");
  await expect(
    page.getByRole("alert").filter({ hasText: "Unclosed" }),
  ).toContainText("Unclosed");
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Lesson Markdown").fill(source);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  const response = await page.request.get(base + "/draft");
  expect(response.status()).toBe(200);
  let { draft } = await response.json();
  expect(draft.steps.flatMap((s: any) => s.blocks)).toHaveLength(11);
  const publish = await page.request.post(base + "/publish", { data: draft });
  expect(publish.status()).toBe(200);
  const publishedVersion = (await publish.json()).version;
  const publicResponse = await page.request.get(
    `/api/published/courses/${course}/lessons/${lesson}`,
  );
  expect(publicResponse.status()).toBe(200);
  expect(JSON.stringify(await publicResponse.json())).not.toContain(
    "checkScript",
  );
  await page.goto(
    "/published/courses/python-foundations/lessons/component-reference",
  );
  await expect(
    page.getByRole("heading", { name: "Component reference" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice and reflect" }),
  ).toBeVisible();
  const stale = await page.request.put(base + "/draft", { data: draft });
  expect(stale.status()).toBe(409);
  draft = { ...draft, title: "Changed draft only", version: publishedVersion };
  expect(
    (await page.request.put(base + "/draft", { data: draft })).status(),
  ).toBe(200);
  expect(
    (
      await (
        await page.request.get(
          `/api/published/courses/${course}/lessons/${lesson}`,
        )
      ).json()
    ).title,
  ).toBe("Component reference");
  expect((await page.request.delete(base + "/publish")).status()).toBe(200);
  expect(
    (
      await page.request.get(
        `/api/published/courses/${course}/lessons/${lesson}`,
      )
    ).status(),
  ).toBe(404);
  const cookies = await page.context().cookies();
  await page.request.delete("/api/auth/session");
  expect((await page.request.get(base + "/draft")).status()).toBe(401);
  const replay = await page.request.get(base + "/draft", {
    headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
  });
  expect(replay.status()).toBe(401);
});
test("staff is assignment-scoped and cannot publish, create, reorder or assign", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/auth/login", {
        data: { email: "python.staff@hku.hk", password: "password" },
      })
    ).status(),
  ).toBe(200);
  const courses = await (await request.get("/api/courses")).json();
  expect(courses).toHaveLength(1);
  expect(courses[0].id).toBe(course);
  expect(
    (
      await request.get("/api/courses/10000000-0000-4000-8000-000000000002")
    ).status(),
  ).toBe(403);
  const { draft } = await (await request.get(base + "/draft")).json();
  expect((await request.put(base + "/draft", { data: draft })).status()).toBe(
    200,
  );
  expect(
    (await request.post(base + "/publish", { data: draft })).status(),
  ).toBe(403);
  expect(
    (
      await request.put(`/api/courses/${course}/assignments`, {
        data: {
          userId: "00000000-0000-4000-8000-000000000003",
          assigned: true,
        },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post(`/api/courses/${course}/lessons`)).status()).toBe(
    403,
  );
  expect(
    (
      await request.put(`/api/courses/${course}/reorder`, {
        data: { kind: "lessons", ids: [lesson] },
      })
    ).status(),
  ).toBe(403);
});
test("management APIs validate, assign and reorder within the course", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  expect(
    (
      await request.post(`/api/courses/${course}/modules`, {
        data: { title: "Second module" },
      })
    ).status(),
  ).toBe(200);
  const modules = await (
      await request.get(`/api/courses/${course}/modules`)
    ).json(),
    ids = modules.map((m: any) => m.id).reverse();
  expect(
    (
      await request.put(`/api/courses/${course}/reorder`, {
        data: { kind: "modules", ids },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get(`/api/courses/${course}/modules`)).json()).map(
      (m: any) => m.id,
    ),
  ).toEqual(ids);
  expect(
    (
      await request.put(`/api/courses/${course}/reorder`, {
        data: { kind: "modules", ids: [] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.put(`/api/courses/${course}/assignments`, {
        data: {
          userId: "00000000-0000-4000-8000-000000000003",
          assigned: true,
        },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/users?q=r.staff")).status()).toBe(200);
  expect((await request.put(base + "/draft", { data: {} })).status()).toBe(400);
  expect(
    (
      await request.put(base + "/draft", {
        headers: { Origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("editor imports files, adds and reorders cards, autosaves and switches on mobile", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const created = await page.request.post(`/api/courses/${course}/lessons`);
  const id = (await created.json()).id;
  await page.goto(`/courses/${course}/lessons/${id}/edit`);
  await page
    .getByLabel("Import Markdown")
    .setInputFiles("content/component-reference.md");
  await expect(page.getByLabel("Lesson Markdown")).toHaveValue(
    /:::worked-example/,
  );
  // Use a new slug so the imported reference does not collide with the seeded lesson.
  const text = await page.getByLabel("Lesson Markdown").inputValue();
  await page
    .getByLabel("Lesson Markdown")
    .fill(
      text.replace('slug="component-reference"', 'slug="imported-reference"'),
    );
  await page.getByRole("button", { name: "Rich Editor", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Add card", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Markdown text Rich Markdown/ })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Actions for card 1", { exact: true }).click();
  await page
    .getByRole("button", { name: "Move card down", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  const saved = await (
    await page.request.get(`/api/courses/${course}/lessons/${id}/draft`)
  ).json();
  expect(saved.draft.steps.flatMap((s: any) => s.blocks)).toHaveLength(12);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByText("LEARNER PREVIEW", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
