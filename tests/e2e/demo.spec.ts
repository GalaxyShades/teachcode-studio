import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("capture the local demo", async ({ page }) => {
  test.skip(
    process.env.CAPTURE_DEMO !== "1",
    "Run npm run demo:screenshots to capture.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  mkdirSync("docs/screenshots", { recursive: true });
  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "Python Foundations" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
    path: "docs/screenshots/01-courses.png",
  });
  await page.goto(
    "/courses/10000000-0000-4000-8000-000000000001/lessons/30000000-0000-4000-8000-000000000001/edit",
  );
  await expect(page.locator("[data-card-id]")).toHaveCount(6);
  await page.screenshot({
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
    path: "docs/screenshots/02-editor.png",
  });
  await page.getByRole("button", { name: "Templates & AI prompt" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
    path: "docs/screenshots/03-ai-toolkit.png",
  });
  await page.keyboard.press("Escape");
  await page.goto(
    "/courses/10000000-0000-4000-8000-000000000001/lessons/30000000-0000-4000-8000-000000000001/preview",
  );
  await page.getByRole("button", { name: /2\. Practice and reflect/ }).click();
  await expect(
    page.getByRole("heading", { name: "Practice and reflect" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
    path: "docs/screenshots/04-learner.png",
  });
});
