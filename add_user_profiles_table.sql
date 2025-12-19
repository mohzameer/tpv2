-- Create user_profiles table to store user emails
-- This avoids needing SECURITY DEFINER functions to access auth.users
-- Run this in Supabase SQL Editor

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY, -- References auth.users(id) as TEXT
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: We can't create a foreign key to auth.users, but we can create an index
-- for the relationship with project_members
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view all profiles (for member lists)
CREATE POLICY "Users can view all profiles"
ON user_profiles FOR SELECT
USING (true);

-- RLS Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (user_id = auth.uid()::TEXT)
WITH CHECK (user_id = auth.uid()::TEXT);

-- RLS Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON user_profiles FOR INSERT
WITH CHECK (user_id = auth.uid()::TEXT);

-- Function to sync user_profiles when auth.users are created/updated
-- This automatically populates user_profiles when users sign up
CREATE OR REPLACE FUNCTION sync_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (NEW.id::TEXT, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-populate user_profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_profile();

-- Migrate existing users to user_profiles
INSERT INTO user_profiles (user_id, email)
SELECT id::TEXT, email
FROM auth.users
WHERE id::TEXT NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO NOTHING;
