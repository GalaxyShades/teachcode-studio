ALTER TABLE cms_lessons ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE cms_lessons ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE cms_lessons ADD COLUMN status text NOT NULL DEFAULT 'draft';
ALTER TABLE cms_content_blocks ADD COLUMN advanced boolean NOT NULL DEFAULT false;
ALTER TABLE cms_mcq_options ADD COLUMN stable_id text;
ALTER TABLE cms_code_exercise_blocks ADD COLUMN expected_output text;
CREATE TABLE IF NOT EXISTS cms_revision_metadata (
 revision_id text PRIMARY KEY REFERENCES cms_lesson_revisions(id) ON DELETE CASCADE,
 title text NOT NULL,slug text NOT NULL,description text NOT NULL,track text NOT NULL,level text NOT NULL,mode text NOT NULL,
 programming_language text NOT NULL,tags text NOT NULL,presentation text NOT NULL,runtime_scope text NOT NULL,source_markdown text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_assignment_profile_idx ON cms_course_staff_assignments(profile_id,course_id);
CREATE INDEX IF NOT EXISTS cms_lessons_course_idx ON cms_lessons(course_id,module_id,position);
CREATE INDEX IF NOT EXISTS cms_lessons_published_idx ON cms_lessons(published_revision_id);
CREATE INDEX IF NOT EXISTS cms_revisions_lesson_idx ON cms_lesson_revisions(lesson_id,revision_number);
CREATE INDEX IF NOT EXISTS cms_steps_revision_idx ON cms_lesson_steps(revision_id,position);
CREATE INDEX IF NOT EXISTS cms_blocks_step_idx ON cms_content_blocks(step_id,position);
