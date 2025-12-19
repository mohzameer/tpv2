-- Quick check: Does the collaboration migration exist?
-- Run this in Supabase SQL Editor to verify

-- Check if project_members table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'project_members'
) AS project_members_exists;

-- Check if helper functions exist
SELECT EXISTS (
  SELECT FROM pg_proc 
  WHERE proname = 'get_user_project_role'
) AS get_user_project_role_exists;

-- Check if is_open column exists on projects
SELECT EXISTS (
  SELECT FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'projects' 
  AND column_name = 'is_open'
) AS projects_is_open_exists;

-- Check migration history (if accessible)
SELECT version, name, inserted_at 
FROM supabase_migrations.schema_migrations 
ORDER BY inserted_at DESC 
LIMIT 5;

