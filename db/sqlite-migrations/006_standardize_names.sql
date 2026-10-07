ALTER TABLE cms_code_exercise_blocks RENAME COLUMN prompt TO instructions;
ALTER TABLE cms_code_exercise_blocks RENAME COLUMN issues_to_ignore TO ignored_issues;
ALTER TABLE cms_course_assistants RENAME COLUMN chips TO suggested_questions;
ALTER TABLE cms_lesson_assistants RENAME COLUMN chips TO suggested_questions;
