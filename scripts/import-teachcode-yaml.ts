import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { db } from "../lib/db";
import { emptyAssistant } from "../lib/content";
import { publishRevision, writeAssistant } from "../lib/repository";
import {
  IMPORT_COURSES,
  UNASSIGNED_CHAPTER,
  lessonFromPack,
  type ImportCourse,
  type YamlPack,
} from "../lib/yaml-import";

type ManifestPack = {
  id?: string;
  path?: string;
  status?: string;
  module?: string;
  topic?: string;
  sequence?: number;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadProductionEnv(root: string) {
  const file = path.join(root, ".env.production.local");
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    process.env[trimmed.slice(0, eq)] = value;
  }
}

async function readManifest(contentRoot: string): Promise<ManifestPack[]> {
  const raw = parse(await readFile(path.join(contentRoot, "manifest.yaml"), "utf8")) as {
    packs?: ManifestPack[];
  };
  return raw.packs ?? [];
}

async function ensureCourse(course: ImportCourse, authorId: string) {
  const existing = (
    await db().query<{ id: string }>("SELECT id FROM cms_courses WHERE slug=$1", [
      course.slug,
    ])
  ).rows[0];
  if (existing) {
    await db().query(
      "UPDATE cms_courses SET title=$1, description=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3",
      [course.title, course.description, existing.id],
    );
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db().transaction(async (c) => {
    await c.query(
      "INSERT INTO cms_courses(id,slug,title,description,created_by) VALUES($1,$2,$3,$4,$5)",
      [id, course.slug, course.title, course.description, authorId],
    );
    await writeAssistant(c, "cms_course_assistants", "course_id", id, emptyAssistant());
    const author = (
      await c.query<{ role: string }>("SELECT role FROM profiles WHERE id=$1", [authorId])
    ).rows[0];
    if (author?.role === "staff") {
      await c.query(
        "INSERT INTO cms_course_staff_assignments(course_id,profile_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, authorId, authorId],
      );
    }
  });
  return id;
}

async function ensureChapter(courseId: string, title: string, position: number) {
  const existing = (
    await db().query<{ id: string }>(
      "SELECT id FROM cms_chapters WHERE course_id=$1 AND title=$2",
      [courseId, title],
    )
  ).rows[0];
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db().query(
    "INSERT INTO cms_chapters(id,course_id,title,position) VALUES($1,$2,$3,$4)",
    [id, courseId, title, position],
  );
  return id;
}

async function ensureLesson(
  courseId: string,
  chapterId: string,
  slug: string,
  title: string,
  authorId: string,
  position: number,
) {
  const existing = (
    await db().query<{ id: string; version: number }>(
      "SELECT id, version FROM cms_lessons WHERE course_id=$1 AND slug=$2",
      [courseId, slug],
    )
  ).rows[0];
  if (existing) {
    await db().query(
      "UPDATE cms_lessons SET chapter_id=$1, position=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3",
      [chapterId, position, existing.id],
    );
    return { id: existing.id, version: Number(existing.version) };
  }
  const lessonId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  await db().transaction(async (c) => {
    await c.query(
      "INSERT INTO cms_lessons(id,course_id,chapter_id,slug,title,updated_by,position) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [lessonId, courseId, chapterId, slug, title, authorId, position],
    );
    await c.query(
      "INSERT INTO cms_lesson_revisions(id,lesson_id,revision_number,state,created_by) VALUES($1,$2,1,'draft',$3)",
      [revisionId, lessonId, authorId],
    );
    await c.query("UPDATE cms_lessons SET draft_revision_id=$1 WHERE id=$2", [
      revisionId,
      lessonId,
    ]);
  });
  return { id: lessonId, version: 0 };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contentRoot = path.resolve(
    arg("--content") || path.resolve("..", "TeachCodeWithGenAI", "content"),
  );
  const origin = arg("--asset-origin") || "https://codewithAI.hku.hk";
  const studioRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  if (apply) loadProductionEnv(studioRoot);

  const manifest = await readManifest(contentRoot);
  let failed = 0;
  for (const course of IMPORT_COURSES) {
    const packs = manifest
      .filter((pack) => pack.module === course.module && pack.status === "ready" && pack.path)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    console.log(`${course.module} lessons ${packs.length}`);
    const converted = [];
    for (const pack of packs) {
      const file = path.join(contentRoot, pack.path as string);
      const lesson = lessonFromPack(parse(await readFile(file, "utf8")) as YamlPack, origin);
      if (lesson.errors.length) {
        failed += 1;
        console.error(`${pack.id}: ${lesson.errors.join("; ")}`);
      }
      converted.push({ pack, lesson });
    }
    if (!apply || failed) continue;
    const authorId = arg("--author-id");
    if (!authorId) throw new Error("--apply requires --author-id");
    const courseId = await ensureCourse(course, authorId);
    const chapters = new Map<string, string>();
    let chapterPosition = 0;
    for (const chapter of course.chapters) {
      chapters.set(
        chapter.topic,
        await ensureChapter(courseId, chapter.title, chapterPosition),
      );
      chapterPosition += 1;
    }
    chapters.set(
      "",
      await ensureChapter(courseId, UNASSIGNED_CHAPTER, chapterPosition),
    );
    for (const [index, item] of converted.entries()) {
      const topic = item.pack.topic || "";
      const chapterId = chapters.get(topic) ?? chapters.get("");
      if (!chapterId) throw new Error(`No chapter for ${item.pack.id}`);
      const lesson = await ensureLesson(
        courseId,
        chapterId,
        item.lesson.draft.slug,
        item.lesson.draft.title,
        authorId,
        index,
      );
      await publishRevision(
        courseId,
        lesson.id,
        { ...item.lesson.draft, version: lesson.version },
        authorId,
        item.lesson.assistant || emptyAssistant(),
      );
    }
  }
  if (failed) process.exitCode = 1;
  if (apply) await db().end();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (process.argv.includes("--apply")) {
    try {
      await db().end();
    } catch {
      /* database was not opened */
    }
  }
  process.exitCode = 1;
});
