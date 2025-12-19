-- Fix My Projects: Add yourself as owner to your existing projects
-- Run this AFTER you've identified your user ID
-- 
-- STEP 1: Find your user ID (run this first)
-- Replace 'your-email@example.com' with your actual email
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'your-email@example.com';

-- STEP 2: Once you have your user ID, run this to add yourself as owner
-- Replace 'YOUR_USER_ID_FROM_STEP_1' with the ID from step 1
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT
  p.id,
  'YOUR_USER_ID_FROM_STEP_1'::TEXT,  -- Replace with your actual user ID
  'owner'
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm 
  WHERE pm.project_id = p.id 
  AND pm.user_id = 'YOUR_USER_ID_FROM_STEP_1'::TEXT
)
ON CONFLICT (project_id, user_id) DO NOTHING;

-- STEP 3: Verify you now have access
SELECT 
  p.id,
  p.name,
  pm.role,
  pm.created_at as member_since
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id = 'YOUR_USER_ID_FROM_STEP_1'::TEXT  -- Replace with your user ID
ORDER BY p.created_at DESC;
