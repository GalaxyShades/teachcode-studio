import { test, expect } from "@playwright/test";
const course = "10000000-0000-4000-8000-000000000001";
test("compact cards drag directly, preserve input editing, and keep Markdown tools on text cards", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id } = await (
    await page.request.post(`/api/courses/${course}/lessons`)
  ).json();
  await page.goto(`/courses/${course}/lessons/${id}/edit`);
  await page
    .getByLabel("Import Markdown")
    .setInputFiles("content/component-reference.md");
  const source = await page.getByLabel("Chapter Markdown").inputValue();
  await page
    .getByLabel("Chapter Markdown")
    .fill(
      source
        .replace('slug="component-reference"', 'slug="simple-editor"')
        .replace('title="Component reference"', 'title="Simple editor test"'),
    );
  await page.getByRole("button", { name: "Rich Editor", exact: true }).click();
  const cards = page.locator("[data-card-id]");
  await expect(cards).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "⠿ Move", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await expect(
    page.getByText("LEARNER PREVIEW", { exact: true }),
  ).not.toBeVisible();
  const task = cards.filter({
    has: page.getByRole("heading", { name: "Task", exact: true }),
  });
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  await task
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Plain task instructions");
  await expect(task.getByRole("toolbar")).toHaveCount(0);
  await task.getByRole("button", { name: "Done", exact: true }).click();
  const text = cards.filter({
    has: page.getByRole("heading", { name: "Markdown text", exact: true }),
  });
  await text.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(text.getByRole("toolbar")).toHaveCount(1);
  await text
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Editable Markdown **content**");
  await text.getByRole("button", { name: "Done", exact: true }).click();
  const original = await cards.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-card-id")),
  );
  const from = await cards
      .nth(0)
      .locator("[data-card-drag-surface]")
      .boundingBox(),
    to = await cards.nth(1).boundingBox();
  await page.mouse.move(from!.x + 70, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 80, from!.y + 30, { steps: 3 });
  await page.mouse.move(to!.x + 70, to!.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-card-id")),
      ),
    )
    .toEqual([original[1], original[0], ...original.slice(2)]);
  const url = `/api/courses/${course}/lessons/${id}/draft`;
  await expect
    .poll(async () => {
      const r = await (await page.request.get(url)).json();
      return r.draft.steps[0].blocks.map((b: any) => b.id);
    })
    .toEqual([original[1], original[0], ...original.slice(2)]);
  // The card itself is also keyboard-sortable; its nested Edit button remains an ordinary button.
  const group = page.getByRole("group", { name: "Task card", exact: true });
  await group.focus();
  await page.keyboard.press("Space");
  await expect(group).toHaveAttribute("data-dragging", "true");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("status").filter({ hasText: "moved over" }),
  ).toContainText(original[0]!);
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-card-id")),
      ),
    )
    .toEqual(original);
  await page.getByRole("button", { name: /2\. Practice and reflect/ }).click();
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Show preview", exact: true }).click();
  await expect(
    page.getByText("LEARNER PREVIEW", { exact: true }),
  ).toBeVisible();
});
