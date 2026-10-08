CREATE TABLE IF NOT EXISTS cms_openrouter_settings (
  profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  api_key text,
  model text
);
