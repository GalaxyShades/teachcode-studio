type NamedRoute = { id: string; slug: string };

/** Prefix browser fetches and history URLs when production uses `basePath`. */
export function withBase(path: string): string {
  const base = (process.env.NEXT_PUBLIC_STUDIO_BASE_PATH || "").replace(
    /\/$/,
    "",
  );
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function coursePath(course: NamedRoute) {
  // Keep historical courses named "new" accessible beside the creation page.
  return `/courses/${encodeURIComponent(course.slug === "new" ? course.id : course.slug)}`;
}

export function assignmentsPath(course: NamedRoute) {
  return `${coursePath(course)}/assignments`;
}

export function generateLessonPath(course: NamedRoute) {
  return `${coursePath(course)}/generate`;
}

export function lessonPath(
  course: NamedRoute,
  lesson: { slug: string },
  view: "edit" | "preview" = "edit",
) {
  return `${coursePath(course)}/lessons/${encodeURIComponent(lesson.slug)}/${view}`;
}
