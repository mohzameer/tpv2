-- Diagnostic queries to identify signup issues
-- Run these in Supabase SQL Editor to check the current state

-- 1. Check if user_profiles table exists and has correct structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 2. Check if RLS is enabled on user_profiles
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'user_profiles';

-- 3. Check RLS policies on user_profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'user_profiles';

-- 4. Check if sync_user_profile function exists
SELECT 
  proname as function_name,
  prosecdef as security_definer,
  proowner::regrole as owner
FROM pg_proc
WHERE proname = 'sync_user_profile';

-- 5. Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 6. Test the function manually (replace with a test user_id)
-- This will show if the function can insert
DO $$
DECLARE
  test_user_id TEXT := '00000000-0000-0000-0000-000000000000';
  test_email TEXT := 'test@example.com';
BEGIN
  -- Try to insert a test profile
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (test_user_id, test_email, 'Test User')
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  
  RAISE NOTICE 'Test insert succeeded';
  
  -- Clean up
  DELETE FROM user_profiles WHERE user_id = test_user_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Test insert failed: %', SQLERRM;
END $$;

-- 7. Check recent auth.users to see if they have profiles
SELECT 
  au.id,
  au.email,
  au.created_at,
  CASE 
    WHEN up.user_id IS NOT NULL THEN 'Has profile'
    ELSE 'Missing profile'
  END as profile_status
FROM auth.users au
LEFT JOIN user_profiles up ON up.user_id = au.id::TEXT
ORDER BY au.created_at DESC
LIMIT 10;

-- 8. Check for any errors in PostgreSQL logs
-- (This requires access to Supabase logs dashboard)
-- Look for errors containing "sync_user_profile" or "user_profiles"
