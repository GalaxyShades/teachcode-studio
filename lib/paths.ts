type NamedRoute = { id: string; slug: string };

export function coursePath(course: NamedRoute) {
  // Keep historical courses named "new" accessible beside the creation page.
  return `/courses/${encodeURIComponent(course.slug === "new" ? course.id : course.slug)}`;
}

export function lessonPath(
  course: NamedRoute,
  lesson: { slug: string },
  view: "edit" | "preview" = "edit",
) {
  return `${coursePath(course)}/lessons/${encodeURIComponent(lesson.slug)}/${view}`;
}
