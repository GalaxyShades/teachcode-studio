ALTER TABLE cms_code_exercise_blocks ADD COLUMN IF NOT EXISTS additional_penalties text[] NOT NULL DEFAULT '{}';
ALTER TABLE cms_code_exercise_blocks ADD COLUMN IF NOT EXISTS issues_to_ignore text[] NOT NULL DEFAULT '{}';
UPDATE cms_code_exercise_blocks
SET additional_penalties = (
  SELECT review.additional_penalties
  FROM cms_content_blocks exercise
  JOIN cms_content_blocks review_block
    ON review_block.step_id = exercise.step_id
   AND review_block.block_type = 'code-review'
   AND review_block.deleted_at IS NULL
  JOIN cms_code_review_blocks review ON review.block_id = review_block.id
  WHERE exercise.id = cms_code_exercise_blocks.block_id
  ORDER BY review_block.position
  LIMIT 1
),
issues_to_ignore = (
  SELECT review.issues_to_ignore
  FROM cms_content_blocks exercise
  JOIN cms_content_blocks review_block
    ON review_block.step_id = exercise.step_id
   AND review_block.block_type = 'code-review'
   AND review_block.deleted_at IS NULL
  JOIN cms_code_review_blocks review ON review.block_id = review_block.id
  WHERE exercise.id = cms_code_exercise_blocks.block_id
  ORDER BY review_block.position
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM cms_content_blocks exercise
  JOIN cms_content_blocks review_block
    ON review_block.step_id = exercise.step_id
   AND review_block.block_type = 'code-review'
   AND review_block.deleted_at IS NULL
  WHERE exercise.id = cms_code_exercise_blocks.block_id
    AND exercise.block_type = 'code-exercise'
    AND exercise.deleted_at IS NULL
);
DELETE FROM cms_content_blocks WHERE block_type = 'code-review';
DROP TABLE IF EXISTS cms_code_review_blocks;
