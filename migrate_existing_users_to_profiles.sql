-- Migrate existing users from auth.users to user_profiles
-- Run this in Supabase SQL Editor

-- Migrate all existing users to user_profiles
INSERT INTO user_profiles (user_id, email, display_name)
SELECT 
  id::TEXT,
  email,
  COALESCE(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'name',
    email
  ) as display_name
FROM auth.users
WHERE id::TEXT NOT IN (SELECT user_id FROM user_profiles)
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
  updated_at = NOW();

-- Verify migration
SELECT 
  COUNT(*) as total_auth_users,
  (SELECT COUNT(*) FROM user_profiles) as total_profiles,
  COUNT(*) - (SELECT COUNT(*) FROM user_profiles) as missing_profiles
FROM auth.users;

-- Show all profiles
SELECT user_id, email, display_name, created_at 
FROM user_profiles 
ORDER BY created_at DESC;
