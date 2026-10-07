ALTER TABLE cms_course_assistants DROP COLUMN IF EXISTS llm_allowed;
ALTER TABLE cms_course_assistants DROP COLUMN IF EXISTS copying_allowed;
ALTER TABLE cms_lesson_assistants DROP COLUMN IF EXISTS llm_allowed;
ALTER TABLE cms_lesson_assistants DROP COLUMN IF EXISTS copying_allowed;
