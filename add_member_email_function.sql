-- Add function to get project members with emails
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_project_members_with_emails(project_id_param TEXT)
RETURNS TABLE (
  id INTEGER,
  project_id TEXT,
  user_id TEXT,
  role TEXT,
  email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
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
    -- Check RLS: user must have access to the project
    AND (
      -- User is authenticated and has access to project
      (auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM project_members pm2 
        WHERE pm2.project_id = project_id_param 
        AND pm2.user_id = auth.uid()::TEXT
      ))
      -- Or allow if user is querying their own membership
      OR pm.user_id = auth.uid()::TEXT
    )
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_project_members_with_emails(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_members_with_emails(TEXT) TO anon;
