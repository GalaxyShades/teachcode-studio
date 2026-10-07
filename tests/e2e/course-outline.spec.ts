import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 65, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + 78, a.y + 25, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await page.mouse.up();
}

test("nested outline creates lessons and chapters, drags cards across groups, and persists order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id } = await (
    await page.request.post("/api/courses", {
      data: { title: "Outline course", slug: "outline-course" },
    })
  ).json();
  const base = `/api/courses/${id}`;
  const state = async () => (await page.request.get(base)).json();
  const first = (await state()).chapters[0].id;
  await page.goto("/courses/outline-course");
  await expect(
    page.getByRole("heading", { name: "Modules", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Drag to reorder" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "＋ Add chapter", exact: true })
    .click();
  await page.getByLabel("New chapter title").fill("Practice");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  const second = (await state()).chapters[1].id;
  const create = async (chapterId: string) =>
    (
      await (
        await page.request.post(base + "/lessons", { data: { chapterId } })
      ).json()
    ).id;
  const a = await create(first),
    b = await create(first);
  await page.reload();
  const chapter = (key: string) =>
    page.locator(`[data-outline-item="chapter:${key}"]`);
  const lesson = (key: string) =>
    page.locator(`[data-outline-item="lesson:${key}"]`);
  const zone = (key: string) => page.locator(`[data-lesson-zone="${key}"]`);
  await expect(
    chapter(first).locator('[data-outline-item^="lesson:"]'),
  ).toHaveCount(2);
  await drag(page, lesson(a), lesson(b));
  await expect
    .poll(async () =>
      (await state()).lessons.map((ch: { id: string }) => ch.id),
    )
    .toEqual([b, a]);
  await drag(page, lesson(a), zone(second));
  await expect
    .poll(
      async () =>
        (await state()).lessons.find((ch: { id: string }) => ch.id === a)
          .chapter_id,
    )
    .toBe(second);
  await expect(
    chapter(second).locator('[data-outline-item^="lesson:"]'),
  ).toHaveCount(1);
  await drag(
    page,
    chapter(first).locator("[data-chapter-surface]"),
    chapter(second).locator("[data-chapter-surface]"),
  );
  await expect
    .poll(async () => (await state()).chapters.map((m: { id: string }) => m.id))
    .toEqual([second, first]);
  await page.reload();
  await expect(
    page.locator('[data-outline-item^="chapter:"]').first(),
  ).toHaveAttribute("data-outline-item", `chapter:${second}`);
  // Keyboard sorting moves the whole chapter, with its lessons intact.
  await expect(chapter(second)).toHaveAttribute("tabindex", "0");
  await chapter(second).focus();
  await page.keyboard.press("Space");
  await expect(chapter(second)).toHaveAttribute("data-dragging", "true");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() =>
      chapter(second).evaluate(
        (el) => new DOMMatrix(getComputedStyle(el).transform).m42,
      ),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await state()).chapters.map((m: { id: string }) => m.id))
    .toEqual([first, second]);
  await chapter(second)
    .getByRole("button", { name: "＋ Add lesson", exact: true })
    .click();
  await page.getByLabel("Lesson name").fill("  Practice with data  ");
  await page
    .getByRole("button", { name: "Create lesson", exact: true })
    .click();
  await expect(
    chapter(second).locator('[data-outline-item^="lesson:"]'),
  ).toHaveCount(2);
  await expect(
    chapter(second).locator('[data-outline-item^="lesson:"]').first(),
  ).toHaveAttribute("data-outline-item", `lesson:${a}`);
  await expect(
    chapter(second).getByRole("link", {
      name: "Practice with data",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    chapter(second).getByRole("link", {
      name: "Practice with data",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await page.request.post(`/api/courses/${id}/lessons`, {
        data: { chapterId: second, title: "   " },
      })
    ).status(),
  ).toBe(400);
  // Reject malformed/stale and cross-course outlines without partial assignment changes.
  const saved = await state();
  const payload = {
    chapters: saved.chapters.map((chapter: { id: string }) => chapter.id),
    lessons: saved.lessons.map(
      (lesson: { id: string; chapter_id: string }) => ({
        id: lesson.id,
        chapterId: lesson.chapter_id,
      }),
    ),
  };
  expect(
    (
      await page.request.put(base + "/outline", {
        data: {
          ...payload,
          lessons: [...payload.lessons, payload.lessons[0]],
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.put(base + "/outline", {
        data: {
          ...payload,
          lessons: payload.lessons.map((lesson: { id: string }) => ({
            ...lesson,
            chapterId: "foreign-group",
          })),
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await state()).lessons.map(
      (lesson: { id: string; chapter_id: string }) => ({
        id: lesson.id,
        chapterId: lesson.chapter_id,
      }),
    ),
  ).toEqual(payload.lessons);
  // A failed drag restores the saved view and reports the failure.
  await page.route("**/outline", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Please retry" }),
    }),
  );
  await drag(page, lesson(b), zone(second));
  await expect(
    page.getByRole("status").filter({ hasText: "Please retry" }),
  ).toBeVisible();
  await expect(
    chapter(first).locator(`[data-outline-item="lesson:${b}"]`),
  ).toHaveCount(1);
  await page.unroute("**/outline");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Assigned staff see the same hierarchy without management controls.
  await page.request.put(base + "/assignments", {
    data: { userId: "00000000-0000-4000-8000-000000000002", assigned: true },
  });
  await page.request.delete("/api/auth/session");
  await page.request.post("/api/auth/login", {
    data: { email: "python.staff@hku.hk", password: "password" },
  });
  await page.reload();
  await expect(
    chapter(second).locator('[data-outline-item^="lesson:"]'),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "＋ Add chapter", exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.put(base + "/outline", { data: payload })).status(),
  ).toBe(403);
  await page.request.delete("/api/auth/session");
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  await page.request.put(base + "/assignments", {
    data: { userId: "00000000-0000-4000-8000-000000000002", assigned: false },
  });
});
