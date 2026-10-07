CREATE TABLE cms_course_assistants_next (
 course_id text PRIMARY KEY REFERENCES cms_courses(id) ON DELETE CASCADE, chips text NOT NULL DEFAULT '[]', constraints text NOT NULL DEFAULT '');
INSERT INTO cms_course_assistants_next (course_id, chips, constraints)
 SELECT course_id, chips, constraints FROM cms_course_assistants;
DROP TABLE cms_course_assistants;
ALTER TABLE cms_course_assistants_next RENAME TO cms_course_assistants;
CREATE TABLE cms_lesson_assistants_next (
 revision_id text PRIMARY KEY REFERENCES cms_lesson_revisions(id) ON DELETE CASCADE, chips text NOT NULL DEFAULT '[]', constraints text NOT NULL DEFAULT '');
INSERT INTO cms_lesson_assistants_next (revision_id, chips, constraints)
 SELECT revision_id, chips, constraints FROM cms_lesson_assistants;
DROP TABLE cms_lesson_assistants;
ALTER TABLE cms_lesson_assistants_next RENAME TO cms_lesson_assistants;
