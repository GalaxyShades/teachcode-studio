import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

test("toolkit copies, downloads, handles denied clipboard, and imports on mobile", async ({
  page,
  context,
}) => {
  const course = "10000000-0000-4000-8000-000000000001";
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id } = await (
    await page.request.post(`/api/courses/${course}/lessons`)
  ).json();
  const { draft: initial } = await (
    await page.request.get(`/api/courses/${course}/lessons/${id}/draft`)
  ).json();
  await page.goto(`/courses/${course}/lessons/${id}/edit`);
  await page.getByRole("button", { name: "Templates & AI prompt" }).click();
  const dialog = page.getByRole("dialog");
  const prompt = await dialog.getByLabel("Copyable AI prompt").inputValue();
  expect(prompt).toContain(":::code-exercise");
  expect(prompt).toContain("END OF AUTHORING GUIDE");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog
    .getByRole("button", { name: "Copy prompt", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Copied to clipboard.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    prompt,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByRole("button", { name: "Complete Markdown template" })
    .click();
  const template = await dialog
    .getByLabel("Copyable Markdown template")
    .inputValue();
  expect(template).toBe(
    readFileSync("content/component-reference.md", "utf8").replace(
      'slug="component-reference"',
      `slug="${initial.slug}"`,
    ),
  );
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("teachcode-template.md");
  expect(readFileSync((await download.path())!, "utf8")).toBe(template);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new Error("Denied");
      },
    });
  });
  await dialog
    .getByRole("button", { name: "Copy template", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Clipboard unavailable",
  );
  expect(
    await dialog
      .getByLabel("Copyable Markdown template")
      .evaluate(
        (el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart,
      ),
  ).toBe(template.length);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Templates & AI prompt" }),
  ).toBeFocused();
  await page
    .getByLabel("Import Markdown")
    .setInputFiles((await download.path())!);
  await expect(page.getByLabel("Lesson Markdown")).toHaveValue(template);
  await expect(
    page.getByRole("alert").filter({ hasText: "Fix these issues" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => {
      const { draft } = await (
        await page.request.get(`/api/courses/${course}/lessons/${id}/draft`)
      ).json();
      return draft.steps.flatMap((step: { blocks: unknown[] }) => step.blocks)
        .length;
    })
    .toBe(11);
  // Duplicate imported slugs give recoverable feedback and preserve the last saved model.
  await page
    .getByLabel("Lesson Markdown")
    .fill(
      template.replace(`slug="${initial.slug}"`, 'slug="component-reference"'),
    );
  await expect(page.getByRole("status").first()).toContainText(
    "Another lesson uses this slug",
  );
  await page.getByLabel("Lesson Markdown").fill(template);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await page.getByRole("button", { name: "Rich Editor", exact: true }).click();
  await expect(page.locator("[data-card-id]")).toHaveCount(6);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByText("LEARNER PREVIEW", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
