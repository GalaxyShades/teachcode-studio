import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  await page.goto(`/courses/${course}/generate`);
  await page.getByRole("button", { name: "Copy a prompt", exact: true }).click();
  const prompt = await page.getByLabel("Copyable AI prompt").inputValue();
  expect(prompt).toContain(":::code-exercise");
  expect(prompt).toContain("END OF AUTHORING GUIDE");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Copied to clipboard.");
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
  await page.getByRole("button", { name: "Complete Markdown template" }).click();
  const template = await page
    .getByLabel("Copyable Markdown template")
    .inputValue();
  expect(template).toBe(readFileSync("content/component-reference.md", "utf8"));
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
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
  await page
    .getByRole("button", { name: "Copy template", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Clipboard unavailable");
  expect(
    await page
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
  const imported = template.replace(
    'slug="component-reference"',
    `slug="${initial.slug}"`,
  );
  const importPath = join(tmpdir(), `teachcode-import-${id}.md`);
  writeFileSync(importPath, imported);
  await page.goto(`/courses/${course}/lessons/${id}/edit`);
  await page.getByLabel("Import Markdown").setInputFiles(importPath);
  await expect(page.getByLabel("Lesson Markdown")).toHaveValue(imported);
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
    .toBe(10);
  // Duplicate imported slugs give recoverable feedback and preserve the last saved model.
  await page
    .getByLabel("Lesson Markdown")
    .fill(
      imported.replace(`slug="${initial.slug}"`, 'slug="component-reference"'),
    );
  await expect(page.getByRole("status").first()).toContainText(
    "Another lesson uses this slug",
  );
  await page.getByLabel("Lesson Markdown").fill(imported);
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
