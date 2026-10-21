CREATE TABLE IF NOT EXISTS cms_planner_threads (
  id text PRIMARY KEY,
  profile_id text NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cms_planner_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES cms_planner_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL DEFAULT '',
  position integer NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(thread_id, position)
);
CREATE INDEX IF NOT EXISTS cms_planner_messages_thread_idx ON cms_planner_messages(thread_id, position);
CREATE TABLE IF NOT EXISTS cms_planner_attachments (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES cms_planner_threads(id) ON DELETE CASCADE,
  filename text NOT NULL,
  extracted_text text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cms_planner_attachments_thread_idx ON cms_planner_attachments(thread_id);
