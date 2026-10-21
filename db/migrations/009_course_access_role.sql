ALTER TABLE cms_course_staff_assignments
  ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'editor'
  CHECK (access_role IN ('owner', 'editor'));

UPDATE cms_course_staff_assignments AS assignment
SET access_role = 'owner'
WHERE (assignment.course_id, assignment.profile_id) IN (
  SELECT course_id, profile_id FROM (
    SELECT
      member.course_id,
      member.profile_id,
      row_number() OVER (
        PARTITION BY member.course_id
        ORDER BY
          CASE WHEN member.profile_id = course.created_by THEN 1 ELSE 0 END,
          lower(coalesce(profile.display_name, '')),
          lower(profile.email),
          member.profile_id
      ) AS rn
    FROM cms_course_staff_assignments member
    JOIN cms_courses course ON course.id = member.course_id
    JOIN profiles profile ON profile.id = member.profile_id
  ) ranked
  WHERE rn = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_assignment_one_owner_idx
  ON cms_course_staff_assignments (course_id)
  WHERE access_role = 'owner';
