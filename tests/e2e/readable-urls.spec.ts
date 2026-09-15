import { test, expect } from "@playwright/test";

test("readable editor routes survive saves, renaming and legacy links", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const created = await page.request.post("/api/courses", {
    data: {
      title: "Readable URLs",
      slug: "readable-urls",
      description: "Routing test",
    },
  });
  expect(created.ok()).toBe(true);
  const { id: courseId } = await created.json();
  await page.goto(`/courses/${courseId}`);
  await expect(page).toHaveURL("/courses/readable-urls");
  await page
    .getByRole("button", { name: "＋ Add chapter", exact: true })
    .click();
  await page.getByLabel("Chapter name").fill("Untitled chapter");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Untitled chapter", exact: true })
    .click();
  await expect(page).toHaveURL(
    "/courses/readable-urls/lessons/new-lesson/edit",
  );
  const lessons = await (
    await page.request.get(`/api/courses/${courseId}/lessons`)
  ).json();
  const lessonId = lessons[0].id;
  await page.getByText("Chapter details", { exact: true }).click();
  await page.getByLabel("Slug", { exact: true }).fill("first-steps");
  await expect(page).toHaveURL(
    "/courses/readable-urls/lessons/first-steps/edit",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/edit`);
  await expect(page).toHaveURL(
    "/courses/readable-urls/lessons/first-steps/edit",
  );
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/preview`);
  await expect(page).toHaveURL(
    "/courses/readable-urls/lessons/first-steps/preview",
  );
  await expect(
    page.getByRole("heading", { name: "Untitled chapter" }),
  ).toBeVisible();
  await page.goto("/courses/readable-urls");
  await expect(
    page.getByRole("link", { name: "Untitled chapter", exact: true }),
  ).toHaveAttribute("href", "/courses/readable-urls/lessons/first-steps/edit");
  await page.getByText("Course settings", { exact: true }).click();
  await page.getByLabel("Slug", { exact: true }).fill("teaching-basics");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(page).toHaveURL("/courses/teaching-basics");
  await page.goto(`/courses/${courseId}/lessons/${lessonId}/edit`);
  await expect(page).toHaveURL(
    "/courses/teaching-basics/lessons/first-steps/edit",
  );
  // Lesson lookup is scoped to its course, even for legacy IDs.
  expect(
    (await page.goto(
      `/courses/python-foundations/lessons/${lessonId}/edit`,
    ))!.status(),
  ).toBe(404);
  expect((await page.goto("/courses/missing-course"))!.status()).toBe(404);
  await page.request.delete("/api/auth/session");
  await page.request.post("/api/auth/login", {
    data: { email: "python.staff@hku.hk", password: "password" },
  });
  expect(
    (await page.goto(
      "/courses/teaching-basics/lessons/first-steps/edit",
    ))!.status(),
  ).toBe(404);
  await page.goto(
    "/courses/python-foundations/lessons/component-reference/edit",
  );
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
  await page.request.delete("/api/auth/session");
  await page.goto(
    "/courses/python-foundations/lessons/component-reference/edit",
  );
  await expect(page).toHaveURL("/login");
});

test("concurrent new lessons receive short unique slugs", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id } = await (
    await request.post("/api/courses", {
      data: { title: "New names", slug: "new-names", description: "" },
    })
  ).json();
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => request.post(`/api/courses/${id}/lessons`)),
  );
  expect(responses.every((r) => r.ok())).toBe(true);
  const lessons = await (
    await request.get(`/api/courses/${id}/lessons`)
  ).json();
  expect(lessons.map((l: { slug: string }) => l.slug).sort()).toEqual([
    "new-lesson",
    "new-lesson-2",
    "new-lesson-3",
  ]);
});
