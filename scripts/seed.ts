import crypto from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { db, isSqlite } from "../lib/db";
import { defaults, blockTypes, type LessonDraft } from "../lib/content";
import { writeRevision } from "../lib/repository";
import { serializeLessonMarkdown, parseLessonMarkdown } from "../lib/markdown";
async function main() {
  if (!isSqlite())
    throw new Error(
      "Demo seeding is restricted to isolated SQLite. Shared identity is never seeded.",
    );
  const admin = "00000000-0000-4000-8000-000000000001";
  const hash = `pbkdf2_sha256$120000$local-demo$${crypto.pbkdf2Sync("password", "local-demo", 120000, 32, "sha256").toString("hex")}`;
  let draft: LessonDraft = {
    title: "Component reference",
    slug: "component-reference",
    description:
      "A reference lesson demonstrating all supported card types. Replace it with your authored lesson.",
    track: "Python",
    level: "year 1",
    mode: "lesson",
    programmingLanguage: "Python",
    tags: ["reference"],
    presentation: "guided",
    runtimeScope: "per-step",
    version: 0,
    steps: [
      {
        id: crypto.randomUUID(),
        title: "Read and explore",
        blocks: blockTypes.slice(0, 6).map((t) => defaults[t]()),
      },
      {
        id: crypto.randomUUID(),
        title: "Practice and reflect",
        blocks: blockTypes.slice(6).map((t) => defaults[t]()),
      },
    ],
  };
  let source: string;
  try {
    source = await readFile("content/component-reference.md", "utf8");
    const parsed = parseLessonMarkdown(source, draft);
    if (parsed.errors.length) throw new Error("Reference source invalid");
    draft = parsed.draft!;
  } catch (e) {
    if ((e as any).code !== "ENOENT") throw e;
    source = serializeLessonMarkdown(draft);
    await writeFile("content/component-reference.md", source);
  }
  draft.sourceMarkdown = source;
  await db().transaction(async (c) => {
    for (const [i, email, name, role] of [
      ["1", "admin@hku.hk", "Local Admin", "admin"],
      ["2", "python.staff@hku.hk", "Python Staff", "staff"],
      ["3", "r.staff@hku.hk", "R Staff", "staff"],
    ])
      await c.query(
        "INSERT INTO profiles(id,email,display_name,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [`00000000-0000-4000-8000-00000000000${i}`, email, name, role, hash],
      );
    for (const [i, slug, title] of [
      ["1", "python-foundations", "Python Foundations"],
      ["2", "r-foundations", "R Foundations"],
    ]) {
      const cid = `10000000-0000-4000-8000-00000000000${i}`,
        mid = `20000000-0000-4000-8000-00000000000${i}`;
      await c.query(
        "INSERT INTO cms_courses(id,slug,title,description,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [cid, slug, title, "Isolated local demo course", admin],
      );
      await c.query(
        "INSERT INTO cms_modules(id,course_id,title,position) VALUES($1,$2,'Getting started',0) ON CONFLICT(id) DO NOTHING",
        [mid, cid],
      );
      await c.query(
        "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [cid, `00000000-0000-4000-8000-00000000000${Number(i) + 1}`, admin],
      );
    }
    const lid = "30000000-0000-4000-8000-000000000001",
      rid = "40000000-0000-4000-8000-000000000001";
    if (
      !(await c.query("SELECT id FROM cms_lessons WHERE id=$1", [lid])).rowCount
    ) {
      await c.query(
        "INSERT INTO cms_lessons(id,course_id,module_id,slug,title,updated_by) VALUES($1,$2,$3,$4,$5,$6)",
        [
          lid,
          "10000000-0000-4000-8000-000000000001",
          "20000000-0000-4000-8000-000000000001",
          draft.slug,
          draft.title,
          admin,
        ],
      );
      await c.query(
        "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
        [rid, lid, admin],
      );
      await c.query("UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2", [
        rid,
        lid,
      ]);
      await writeRevision(c, rid, draft, admin);
    }
  });
  await db().end();
  console.log(
    "Demo: admin@hku.hk, python.staff@hku.hk, r.staff@hku.hk / password. Reference Markdown: content/component-reference.md",
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
