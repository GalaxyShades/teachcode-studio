import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("published history restores only the draft and enforces permissions and conflicts", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id: course } = await (
    await page.request.post("/api/courses", {
      data: { title: "History course", slug: "history-course" },
    })
  ).json();
  const { id: chapter } = await (
    await page.request.post(`/api/courses/${course}/lessons`, {
      data: { title: "History chapter" },
    })
  ).json();
  const base = `/api/courses/${course}/lessons/${chapter}`;
  const getDraft = async () =>
    (await (await page.request.get(base + "/draft")).json()).draft;
  await page.goto(`/courses/${course}/lessons/${chapter}/edit`);
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(
    page.getByText("No published versions yet.", { exact: false }),
  ).toBeVisible();
  let draft = await getDraft();
  const versions: string[] = [];
  for (let n = 1; n <= 7; n++) {
    const response = await page.request.post(base + "/publish", {
      data: { ...draft, title: `Snapshot ${n}` },
    });
    expect(response.ok()).toBe(true);
    const result = await response.json();
    versions.push(result.revisionId);
    draft = { ...draft, version: result.version };
  }
  const history = await (await page.request.get(base + "/history")).json();
  expect(history.versions.map((v: { id: string }) => v.id)).toEqual(
    versions.slice(-5).reverse(),
  );
  expect(
    (
      await page.request.post(base + "/history", {
        data: { revisionId: versions[0], version: draft.version },
      })
    ).status(),
  ).toBe(404);
  await page.reload();
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Version history" });
  await expect(
    panel.getByRole("button", { name: /Restore version/ }),
  ).toHaveCount(5);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel
    .getByRole("button", { name: "Restore version 4 to draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Snapshot 7", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Restore version 4 to draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Snapshot 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Restored to draft · Publish to make these changes public", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await getDraft()).title).toBe("Snapshot 3");
  const publicDraft = async () =>
    await (
      await page.request.get(
        `/api/v1/content/courses/${course}/chapters/${chapter}`,
      )
    ).json();
  expect((await publicDraft()).title).toBe("Snapshot 7");
  expect(
    (
      await page.request.post(base + "/history", {
        data: { revisionId: versions[3], version: draft.version },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(async () => (await publicDraft()).title).toBe("Snapshot 3");
  await page.request.delete(base);
  const archived = await getDraft();
  expect(
    (
      await page.request.post(base + "/history", {
        data: { revisionId: versions[4], version: archived.version },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.get(
        `/api/v1/content/courses/${course}/chapters/${chapter}`,
      )
    ).status(),
  ).toBe(404);
  await page.request.post("/api/auth/login", {
    data: { email: "python.staff@hku.hk", password: "password" },
  });
  expect((await page.request.get(base + "/history")).status()).toBe(403);
  expect(
    (
      await page.request.post(base + "/history", {
        data: { revisionId: versions[4], version: archived.version },
      })
    ).status(),
  ).toBe(403);
});
