import { sampleBlocks } from "./fixtures";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../lib/auth", () => ({ currentUser: vi.fn(), requireUser: vi.fn() }));
import { currentUser, requireUser } from "../lib/auth";
import { resolveEditorCourse, resolveEditorLesson } from "../lib/editor-routes";
import { createLesson } from "../lib/cms";
import { editModule, saveOutline } from "../lib/management";
import { db, assertDatabase } from "../lib/db";
import { migrate } from "../scripts/migrate";
import {
  writeRevision,
  loadRevision,
  persistDraft,
  publishRevision,
} from "../lib/repository";
import { type LessonDraft } from "../lib/content";
const suite = process.env.TEST_POSTGRES === "1" ? describe : describe.skip;
suite("real PostgreSQL adapter on a disposable cluster", () => {
  let pg: import("embedded-postgres").default;
  let dir: string;
  const a = crypto.randomUUID(),
    c = crypto.randomUUID(),
    l = crypto.randomUUID(),
    r = crypto.randomUUID();
  const draft: LessonDraft = {
    title: "Postgres test",
    slug: "pg-test",
    description: "",
    track: "Python",
    level: "year 1",
    mode: "lesson",
    programmingLanguage: "Python",
    tags: ["pg"],
    presentation: "guided",
    runtimeScope: "per-step",
    version: 0,
    steps: [
      {
        id: "named-step",
        title: "Step",
        blocks: sampleBlocks().map((b) => ({ ...b, id: `named-${b.type}` })),
      },
    ],
  };
  beforeAll(async () => {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    dir = mkdtempSync(join(tmpdir(), "teachcode-pg-"));
    pg = new EmbeddedPostgres({
      databaseDir: join(dir, "cluster"),
      port: 15439,
      user: "testuser",
      password: crypto.randomBytes(20).toString("hex"),
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    const client = pg.getPgClient();
    await client.connect();
    // Simulate pre-existing shared identity. CMS migration must not alter these tables.
    await client.query(
      "CREATE TABLE profiles(id uuid PRIMARY KEY,email text,display_name text,role text,password_hash text); CREATE TABLE auth_sessions(token text PRIMARY KEY,user_id uuid REFERENCES profiles(id),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL)",
    );
    const config = (client as any).connectionParameters;
    process.env.DATABASE_MODE = "postgres";
    process.env.DATABASE_URL = `postgresql://${config.user}:${config.password}@localhost:15439/${config.database}`;
    await client.end();
    await migrate();
    await db().query("INSERT INTO profiles VALUES($1,$2,$3,$4,$5)", [
      a,
      "test@hku.hk",
      "Test",
      "admin",
      "unused",
    ]);
    await db().query(
      "INSERT INTO cms_courses(id,slug,title,created_by) VALUES($1,$2,$3,$4)",
      [c, "pg", "PG", a],
    );
    await db().query(
      "INSERT INTO cms_lessons(id,course_id,slug,title,updated_by) VALUES($1,$2,$3,$4,$5)",
      [l, c, draft.slug, draft.title, a],
    );
    await db().query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [r, l, a],
    );
    await db().query(
      "UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2",
      [r, l],
    );
    await db().transaction((client) => writeRevision(client, r, draft, a));
  }, 60000);
  afterAll(async () => {
    await db().end();
    await pg?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
    delete process.env.DATABASE_MODE;
    delete process.env.DATABASE_URL;
  }, 30000);
  it("validates the user_id session schema and idempotent constraints", async () => {
    await assertDatabase();
    await migrate();
    await db().query(readFileSync("db/migrations/001_cms_schema.sql", "utf8"));
    expect(
      (
        await db().query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='auth_sessions' ORDER BY ordinal_position",
        )
      ).rows.map((r) => r.column_name),
    ).toEqual(["token", "user_id", "created_at", "expires_at"]);
  });
  it("hydrates normalized details and preserves immutable publications", async () => {
    expect(
      (await loadRevision(db(), {}, r)).steps[0].blocks.map((b) => b.id),
    ).toEqual(draft.steps[0].blocks.map((b) => b.id));
    const result = await publishRevision(c, l, draft, a);
    await persistDraft(c, l, { ...draft, version: 1, title: "Changed" }, a);
    expect((await loadRevision(db(), {}, result.revisionId)).title).toBe(
      draft.title,
    );
  });
  it("serializes conflicting draft versions on one pooled transaction connection", async () => {
    const results = await Promise.allSettled([
      persistDraft(c, l, { ...draft, version: 2 }, a),
      persistDraft(c, l, { ...draft, version: 2 }, a),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("resolves readable routes against UUID columns and allocates concurrent lesson names", async () => {
    const user = {
      id: a,
      email: "test@hku.hk",
      display_name: "Test",
      role: "admin" as const,
    };
    vi.mocked(currentUser).mockResolvedValue(user);
    vi.mocked(requireUser).mockResolvedValue(user);
    expect(await resolveEditorCourse("pg")).toEqual({ id: c, slug: "pg" });
    expect(await resolveEditorCourse(c)).toEqual({ id: c, slug: "pg" });
    expect(await resolveEditorLesson(c, "pg-test")).toEqual({
      id: l,
      slug: "pg-test",
    });
    expect(await resolveEditorLesson(c, l)).toEqual({ id: l, slug: "pg-test" });
    await expect(resolveEditorCourse("missing-course")).rejects.toThrow();
    const ids = await Promise.all([
      createLesson(c),
      createLesson(c),
      createLesson(c),
    ]);
    expect(new Set(ids).size).toBe(3);
    const names = (
      await db().query(
        "SELECT slug FROM cms_lessons WHERE course_id=$1 AND slug LIKE 'new-lesson%' ORDER BY slug",
        [c],
      )
    ).rows.map((lesson) => lesson.slug);
    expect(names).toEqual(["new-lesson", "new-lesson-2", "new-lesson-3"]);
  });
  it("saves nested outline ordering and assignments atomically", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: a,
      email: "test@hku.hk",
      display_name: "Test",
      role: "admin",
    });
    await editModule(c, { title: "First lesson" });
    await editModule(c, { title: "Second lesson" });
    const groups = (
      await db().query(
        "SELECT id FROM cms_modules WHERE course_id=$1 ORDER BY position",
        [c],
      )
    ).rows.map((m) => m.id);
    const chapters = (
      await db().query(
        "SELECT id FROM cms_lessons WHERE course_id=$1 ORDER BY id",
        [c],
      )
    ).rows.map((ch, i) => ({ id: ch.id, lessonId: groups[i % 2] }));
    const outline = {
      lessons: [...groups].reverse(),
      chapters: [...chapters].reverse(),
    };
    await saveOutline(c, outline);
    const read = async () => ({
      lessons: (
        await db().query(
          "SELECT id FROM cms_modules WHERE course_id=$1 ORDER BY position",
          [c],
        )
      ).rows.map((m) => m.id),
      chapters: (
        await db().query(
          "SELECT id,module_id FROM cms_lessons WHERE course_id=$1 ORDER BY position",
          [c],
        )
      ).rows.map((ch) => ({ id: ch.id, lessonId: ch.module_id })),
    });
    expect(await read()).toEqual(outline);
    await expect(
      saveOutline(c, { ...outline, chapters: chapters.slice(1) }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveOutline(c, {
        ...outline,
        chapters: chapters.map((ch) => ({
          ...ch,
          lessonId: crypto.randomUUID(),
        })),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await read()).toEqual(outline);
    const created = await createLesson(c, groups[1]);
    expect(
      (
        await db().query(
          "SELECT id FROM cms_lessons WHERE course_id=$1 ORDER BY position DESC LIMIT 1",
          [c],
        )
      ).rows[0].id,
    ).toBe(created);
    expect(
      (
        await db().query("SELECT module_id FROM cms_lessons WHERE id=$1", [
          created,
        ])
      ).rows[0].module_id,
    ).toBe(groups[1]);
  });
  it("retains five latest publications and cascades removed snapshot content", async () => {
    const initial = (
      await db().query("SELECT * FROM cms_lessons WHERE id=$1", [l])
    ).rows[0];
    let version = initial.version;
    const ids: string[] = [];
    for (let n = 0; n < 7; n++) {
      const result = await publishRevision(
        c,
        l,
        { ...draft, title: `Publication ${n}`, version },
        a,
      );
      version = result.version;
      ids.push(result.revisionId);
    }
    const retained = async () =>
      (
        await db().query(
          "SELECT id FROM cms_lesson_revisions WHERE lesson_id=$1 AND state='published' ORDER BY revision_number",
          [l],
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
        [l],
      )
    ).rows[0];
    expect(current.published_revision_id).toBe(ids[6]);
    expect((await loadRevision(db(), {}, ids[2])).title).toBe("Publication 2");
    await expect(
      publishRevision(c, l, { ...draft, version: version - 1 }, a),
    ).rejects.toMatchObject({ status: 409 });
    expect(await retained()).toEqual(ids.slice(-5));
  });
});
