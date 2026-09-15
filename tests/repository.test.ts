import { publishedCourses, publishedCourse } from "../lib/published-catalog";
import { sampleBlocks } from "./fixtures";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
import crypto from "node:crypto";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { db, assertDatabase } from "../lib/db";
import { migrate } from "../scripts/migrate";
import { blockTypes, type LessonDraft } from "../lib/content";
import {
  writeRevision,
  loadRevision,
  persistDraft,
  publishRevision,
  restoreRevision,
  publishedLesson,
} from "../lib/repository";
import { verifyPassword, authenticate, sessionUser } from "../lib/auth";
import { canAccess } from "../lib/cms";
const dir = mkdtempSync(join(tmpdir(), "teachcode-test-")),
  admin = "a",
  cid = "c",
  lid = "l",
  rid = "r";
const draft: LessonDraft = {
  title: "Test",
  slug: "test",
  description: "Test outcomes",
  track: "Python",
  level: "year 1",
  mode: "lesson",
  programmingLanguage: "Python",
  tags: ["a", "b"],
  presentation: "guided",
  runtimeScope: "per-step",
  version: 0,
  steps: [{ id: "s", title: "Step", blocks: sampleBlocks() }],
};
beforeAll(async () => {
  process.env.DATABASE_MODE = "sqlite";
  process.env.SQLITE_DATABASE_PATH = join(dir, "test.db");
  new DatabaseSync(process.env.SQLITE_DATABASE_PATH).close();
  await migrate();
  const hash = `pbkdf2_sha256$120000$salt$${crypto.pbkdf2Sync("password", "salt", 120000, 32, "sha256").toString("hex")}`;
  for (const [id, role] of [
    ["a", "admin"],
    ["s", "staff"],
    ["o", "student"],
  ])
    await db().query("INSERT INTO profiles VALUES($1,$2,$3,$4,$5)", [
      id,
      id + "@hku.hk",
      id,
      role,
      hash,
    ]);
  await db().query(
    "INSERT INTO cms_courses(id,slug,title,created_by) VALUES('c','course','Course','a')",
  );
  await db().query(
    "INSERT INTO cms_lessons(id,course_id,slug,title,updated_by) VALUES('l','c','test','Test','a')",
  );
  await db().query(
    "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES('r','l',1,'draft','a')",
  );
  await db().query("UPDATE cms_lessons SET draft_revision_id='r' WHERE id='l'");
  await db().transaction((c) => writeRevision(c, rid, draft, admin));
});
afterAll(async () => {
  await db().end();
  rmSync(dir, { recursive: true, force: true });
});
describe("SQLite repository", () => {
  it("tracks idempotent migrations and validates startup", async () => {
    await migrate();
    await assertDatabase();
    expect(
      (await db().query("SELECT * FROM cms_schema_migrations")).rowCount,
    ).toBe(2);
  });
  it("binds repeated and out-of-order parameters", async () =>
    expect(
      (await db().query("SELECT $2 second, $1 first, $2 again", [1, 2]))
        .rows[0],
    ).toEqual({ second: 2, first: 1, again: 2 }));
  it("loads every normalized component and stable ID", async () => {
    const loaded = await loadRevision(db(), { version: 0 }, rid);
    expect(loaded.steps[0].blocks.map((b) => b.type)).toEqual(blockTypes);
    expect(loaded.steps[0].blocks.map((b) => b.id)).toEqual(
      draft.steps[0].blocks.map((b) => b.id),
    );
    expect(loaded.tags).toEqual(["a", "b"]);
    expect(loaded.steps[0].blocks).toEqual(draft.steps[0].blocks);
  });
  it("rolls back failed transactions", async () => {
    await expect(
      db().transaction(async (c) => {
        await c.query("UPDATE cms_courses SET title='bad' WHERE id='c'");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      (await db().query("SELECT title FROM cms_courses WHERE id='c'")).rows[0]
        .title,
    ).toBe("Course");
  });
  it("publishes immutable snapshots and rejects stale saves", async () => {
    await expect(publishedLesson(cid, lid)).rejects.toMatchObject({
      status: 404,
    });
    const p = await publishRevision(cid, lid, draft, admin);
    expect(p.version).toBe(1);
    await persistDraft(
      cid,
      lid,
      {
        ...draft,
        title: "Edited draft",
        version: 1,
        steps: [...draft.steps].map((s) => ({
          ...s,
          blocks: [...s.blocks].reverse(),
        })),
      },
      admin,
    );
    expect((await publishedLesson(cid, lid)).title).toBe("Test");
    expect((await publishedLesson(cid, lid)).steps[0].blocks[0].type).toBe(
      "text",
    );
    await expect(persistDraft(cid, lid, draft, admin)).rejects.toMatchObject({
      status: 409,
    });
    const next = await publishRevision(
      cid,
      lid,
      { ...draft, title: "Second", version: 2 },
      admin,
    );
    expect(next.version).toBe(3);
    expect((await loadRevision(db(), {}, p.revisionId)).title).toBe("Test");
  });
  it("withholds author-only content from public data", async () => {
    const p = await publishedLesson(cid, lid);
    expect(p.sourceMarkdown).toBe("");
    expect(p.version).toBeUndefined();
    expect(
      p.steps.flatMap((s) => s.blocks).some((b) => b.type === "tutor-config"),
    ).toBe(false);
    expect(JSON.stringify(p)).not.toContain("checkScript");
  });
  it("enforces assigned staff and other-role access rules", async () => {
    const user = (role: string, id = "s") => ({
      id,
      email: "",
      display_name: "",
      role,
    });
    expect(await canAccess(cid, user("admin"))).toBe(true);
    expect(await canAccess(cid, user("staff"))).toBe(false);
    await db().query(
      "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES('c','s','a')",
    );
    expect(await canAccess(cid, user("staff"))).toBe(true);
    expect(await canAccess(cid, user("student"))).toBe(false);
  });
  it("verifies passwords and validates session expiration", async () => {
    expect(await authenticate("a@hku.hk", "password")).toMatchObject({
      role: "admin",
    });
    expect(await authenticate("a@hku.hk", "wrong")).toBeNull();
    expect(await authenticate("o@hku.hk", "password")).toBeNull();
    expect(verifyPassword("password", "pbkdf2_sha256$NaN$salt$bad")).toBe(
      false,
    );
    await db().query(
      "INSERT INTO auth_sessions(token,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)",
      ["expired", "a", new Date(0).toISOString(), new Date(1).toISOString()],
    );
    expect(await sessionUser("expired")).toBeNull();
  });
  it("retains five latest publications and cascades removed snapshot content", async () => {
    const initial = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [lid])
    ).rows[0];
    let version = initial.version;
    const ids: string[] = [];
    for (let n = 0; n < 7; n++) {
      const result = await publishRevision(
        cid,
        lid,
        { ...draft, title: `Publication ${n}`, version },
        admin,
      );
      version = result.version;
      ids.push(result.revisionId);
    }
    const retained = async () =>
      (
        await db().query(
          "SELECT id FROM cms_lesson_revisions WHERE lesson_id=$1 AND state='published' ORDER BY revision_number",
          [lid],
        )
      ).rows.map((row) => row.id);
    expect(await retained()).toEqual(ids.slice(-5));
    for (const id of ids.slice(0, 2)) {
      expect(
        (
          await db().query(
            "SELECT id FROM cms_content_blocks WHERE revision_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await db().query(
            "SELECT id FROM cms_lesson_steps WHERE revision_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
    }
    expect(
      (await loadRevision(db(), {}, initial.draft_revision_id)).title,
    ).toBe("Publication 6");
    const current = (
      await db().query(
        "SELECT published_revision_id FROM cms_lessons WHERE id=$1",
        [lid],
      )
    ).rows[0];
    expect(current.published_revision_id).toBe(ids[6]);
    expect((await loadRevision(db(), {}, ids[2])).title).toBe("Publication 2");
    await expect(
      publishRevision(cid, lid, { ...draft, version: version - 1 }, admin),
    ).rejects.toMatchObject({ status: 409 });
    expect(await retained()).toEqual(ids.slice(-5));
    await expect(
      restoreRevision(cid, lid, ids[0], version, admin),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      restoreRevision(cid, lid, initial.draft_revision_id, version, admin),
    ).rejects.toMatchObject({ status: 404 });
    const restored = await restoreRevision(cid, lid, ids[2], version, admin);
    expect(restored.draft.title).toBe("Publication 2");
    expect(restored.draft.version).toBe(version + 1);
    expect(
      (await loadRevision(db(), {}, initial.draft_revision_id)).title,
    ).toBe("Publication 2");
    expect(
      (
        await db().query(
          "SELECT published_revision_id FROM cms_lessons WHERE id=$1",
          [lid],
        )
      ).rows[0].published_revision_id,
    ).toBe(ids[6]);
    expect((await loadRevision(db(), {}, ids[6])).title).toBe("Publication 6");
    await expect(
      restoreRevision(cid, lid, ids[3], version, admin),
    ).rejects.toMatchObject({ status: 409 });
    expect(await retained()).toEqual(ids.slice(-5));
    expect((await publishedCourses()).some((row) => row.id === cid)).toBe(true);
    expect(await publishedLesson(cid, lid)).toMatchObject({
      title: "Publication 6",
      courseId: cid,
      chapterId: lid,
      revisionId: ids[6],
    });
    const catalogue = await publishedCourse(cid);
    const visibleChapters = [
      ...catalogue.lessons.flatMap((group) => group.chapters),
      ...catalogue.unassignedChapters,
    ];
    expect(visibleChapters.find((ch) => ch.id === lid)).toMatchObject({
      title: "Publication 6",
      revisionId: ids[6],
    });
    expect(JSON.stringify(catalogue)).not.toContain("Publication 2");
    await db().query("UPDATE cms_courses SET status='draft' WHERE id=$1", [
      cid,
    ]);
    expect((await publishedCourses()).some((row) => row.id === cid)).toBe(
      false,
    );
    await expect(publishedCourse(cid)).rejects.toMatchObject({ status: 404 });
    await db().query("UPDATE cms_courses SET status='published' WHERE id=$1", [
      cid,
    ]);
  });
});
