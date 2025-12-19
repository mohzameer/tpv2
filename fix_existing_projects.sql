-- Fix existing projects: Add current authenticated user as owner
-- Run this in Supabase SQL Editor while authenticated

-- Step 1: Check your user ID
SELECT id, email FROM auth.users WHERE id = auth.uid();

-- Step 2: See which projects you don't have access to
SELECT 
  p.id,
  p.name,
  p.owner_id,
  p.guest_id,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM project_members pm 
      WHERE pm.project_id = p.id 
      AND pm.user_id = auth.uid()::TEXT
    ) THEN 'Has access'
    ELSE 'No access'
  END AS access_status
FROM projects p
ORDER BY p.created_at DESC;

-- Step 3: Add yourself as owner to ALL existing projects
-- This will give you access to all projects that don't already have you as a member
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT
  p.id,
  auth.uid()::TEXT,
  'owner'
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm 
  WHERE pm.project_id = p.id 
  AND pm.user_id = auth.uid()::TEXT
)
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Step 4: Verify you now have access
SELECT 
  p.id,
  p.name,
  pm.role,
  pm.created_at as member_since
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id = auth.uid()::TEXT
ORDER BY p.created_at DESC;
