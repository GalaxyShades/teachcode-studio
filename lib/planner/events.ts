export const plannerContentChanged = "planner-content-changed";

export type PlannerWriteAction =
  | "create_lesson"
  | "update_lesson"
  | "update_card"
  | "insert_card"
  | "delete_card"
  | "create_chapter"
  | "move_lesson";

export type PlannerContentChange = {
  action: PlannerWriteAction;
  courseId: string;
  lessonId?: string;
};

const writeActions = new Set<string>([
  "create_lesson",
  "update_lesson",
  "update_card",
  "insert_card",
  "delete_card",
  "create_chapter",
  "move_lesson",
]);

const lessonReloadActions = new Set<string>([
  "create_lesson",
  "update_lesson",
  "update_card",
  "insert_card",
  "delete_card",
]);

/** True when the open lesson editor should reload this lesson's draft. */
export function plannerReloadsLesson(action: string) {
  return lessonReloadActions.has(action);
}

export function plannerWriteChange(
  action: string,
  result: {
    ok?: boolean;
    courseId?: unknown;
    lessonId?: unknown;
    [key: string]: unknown;
  },
): PlannerContentChange | null {
  if (result.ok !== true || !writeActions.has(action)) return null;
  if (typeof result.courseId !== "string" || !result.courseId) return null;
  return {
    action: action as PlannerWriteAction,
    courseId: result.courseId,
    lessonId: typeof result.lessonId === "string" ? result.lessonId : undefined,
  };
}
