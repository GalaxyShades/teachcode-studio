import { test, expect } from "@playwright/test";
test("student app reads published content without an author session or draft leakage", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  const { id: courseId } = await (
    await request.post("/api/courses", {
      data: { title: "Public catalogue", slug: "public-catalogue" },
    })
  ).json();
  const courseBase = `/api/courses/${courseId}`;
  const { id: chapterId } = await (
    await request.post(courseBase + "/lessons", {
      data: { title: "Public chapter" },
    })
  ).json();
  await request.post(courseBase + "/lessons", {
    data: { title: "Secret draft" },
  });
  const base = `${courseBase}/lessons/${chapterId}`;
  const draft = (await (await request.get(base + "/draft")).json()).draft;
  const publication = await (
    await request.post(base + "/publish", { data: draft })
  ).json();
  const save = await request.put(base + "/draft", {
    data: {
      ...draft,
      version: publication.version,
      title: "Private changes",
      slug: "private-changes",
    },
  });
  expect(save.ok()).toBe(true);
  await request.delete("/api/auth/session");
  expect((await request.get("/api/courses")).status()).toBe(401);
  const listing = await request.get("/api/v1/content/courses");
  expect(listing.status()).toBe(200);
  expect(listing.headers()["cache-control"]).toBe("no-store");
  expect(
    (await listing.json()).some((c: { id: string }) => c.id === courseId),
  ).toBe(true);
  const response = await request.get(`/api/v1/content/courses/${courseId}`);
  const outline = await response.json();
  expect(outline.lessons).toHaveLength(1);
  expect(outline.lessons[0].chapters).toHaveLength(1);
  const chapter = outline.lessons[0].chapters[0];
  expect(chapter).toMatchObject({
    id: chapterId,
    title: "Public chapter",
    slug: draft.slug,
    revisionId: publication.revisionId,
  });
  expect(JSON.stringify(outline)).not.toContain("Secret draft");
  expect(JSON.stringify(outline)).not.toContain("Private changes");
  const content = await (await request.get(chapter.contentUrl)).json();
  expect(content).toMatchObject({
    courseId,
    chapterId,
    revisionId: publication.revisionId,
    title: "Public chapter",
  });
  expect(content.version).toBeUndefined();
  expect(content.sourceMarkdown).toBeUndefined();
  expect(content.apiVersion).toBe(1);
  expect(response.headers()["x-content-api-version"]).toBe("1");
  const head = await request.head(chapter.contentUrl);
  expect(head.status()).toBe(200);
  expect(await head.text()).toBe("");
  for (const path of [
    "/api/v1/content/courses/not-a-uuid",
    `/api/v1/content/courses/${courseId}/chapters/not-a-uuid`,
  ]) {
    const bad = await request.get(path);
    expect(bad.status()).toBe(400);
    expect((await bad.json()).code).toBe("INVALID_ID");
  }
  const missing = await request.get(
    `/api/v1/content/courses/${courseId}/chapters/00000000-0000-4000-8000-000000000000`,
  );
  expect(missing.status()).toBe(404);
  expect((await missing.json()).code).toBe("PUBLISHED_CONTENT_NOT_FOUND");
  expect(
    (
      await request.fetch(`/api/v1/content/courses/${courseId}`, {
        method: "OPTIONS",
      })
    ).status(),
  ).toBe(204);
  await request.post("/api/auth/login", {
    data: { email: "admin@hku.hk", password: "password" },
  });
  await request.delete(base + "/publish");
  expect(
    (await request.get(`/api/v1/content/courses/${courseId}`)).status(),
  ).toBe(404);
  expect(
    (await (await request.get("/api/v1/content/courses")).json()).some(
      (c: { id: string }) => c.id === courseId,
    ),
  ).toBe(false);
});
