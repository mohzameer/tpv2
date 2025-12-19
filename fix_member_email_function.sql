-- Fix: Update function to properly handle RLS and return members
-- Run this in Supabase SQL Editor

DROP FUNCTION IF EXISTS get_project_members_with_emails(TEXT);

CREATE OR REPLACE FUNCTION get_project_members_with_emails(project_id_param TEXT)
RETURNS TABLE (
  id INTEGER,
  project_id TEXT,
  user_id TEXT,
  role TEXT,
  email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user has access to this project
  -- If not authenticated or not a member, return empty
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = project_id_param 
    AND pm.user_id = auth.uid()::TEXT
  ) THEN
    RETURN;
  END IF;
  
  -- User has access, return all members with emails
  RETURN QUERY
  SELECT 
    pm.id,
    pm.project_id,
    pm.user_id,
    pm.role,
    u.email,
    pm.created_at,
    pm.updated_at
  FROM project_members pm
  LEFT JOIN auth.users u ON u.id::TEXT = pm.user_id
  WHERE pm.project_id = project_id_param
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_project_members_with_emails(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_members_with_emails(TEXT) TO anon;
