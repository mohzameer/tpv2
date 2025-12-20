-- User profiles table to store user preferences and last visited
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY, -- References auth.users.id (stored as TEXT)
  email TEXT,
  display_name TEXT,
  last_project_id TEXT,
  last_doc_id INTEGER, -- References documents.id
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Updated_at trigger
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Permissive policy for Phase 1
CREATE POLICY "Allow all for now" ON user_profiles FOR ALL USING (true) WITH CHECK (true);

