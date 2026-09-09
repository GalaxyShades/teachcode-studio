import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("login and editor accessibility", async ({ page }) => {
  await page.goto("/login");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  await page.goto(
    "/courses/10000000-0000-4000-8000-000000000001/lessons/30000000-0000-4000-8000-000000000001/edit",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).waitFor();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .locator("[data-card-id]")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
