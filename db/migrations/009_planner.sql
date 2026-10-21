CREATE TABLE IF NOT EXISTS cms_planner_threads (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cms_planner_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES cms_planner_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL DEFAULT '',
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id, position)
);
CREATE INDEX IF NOT EXISTS cms_planner_messages_thread_idx ON cms_planner_messages(thread_id, position);
CREATE TABLE IF NOT EXISTS cms_planner_attachments (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES cms_planner_threads(id) ON DELETE CASCADE,
  filename text NOT NULL,
  extracted_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_planner_attachments_thread_idx ON cms_planner_attachments(thread_id);
