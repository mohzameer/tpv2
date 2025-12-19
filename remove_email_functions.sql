-- Remove the email lookup functions (no longer needed with user_profiles table)
-- Run this in Supabase SQL Editor

-- Drop get_project_members_with_emails (replaced by user_profiles join)
DROP FUNCTION IF EXISTS get_project_members_with_emails(TEXT);

-- Drop get_user_id_by_email (replaced by user_profiles query)
DROP FUNCTION IF EXISTS get_user_id_by_email(TEXT);

-- Verify they're removed
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('get_project_members_with_emails', 'get_user_id_by_email');
