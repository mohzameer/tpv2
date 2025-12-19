-- User Self-Service: Claim My Projects
-- Users can run this to claim ownership of their guest projects
-- This runs in the context of the authenticated user (auth.uid())
-- Safe to run multiple times

-- ============================================================================
-- Step 1: Show projects you might own (based on guest_id pattern or creation)
-- ============================================================================
-- This is informational - shows projects that might belong to you
SELECT 
  p.id,
  p.name,
  p.guest_id,
  p.created_at,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM project_members pm 
      WHERE pm.project_id = p.id 
      AND pm.user_id = auth.uid()::TEXT
    ) THEN 'Already claimed'
    ELSE 'Not claimed'
  END AS status
FROM projects p
WHERE p.owner_id IS NULL
  AND p.guest_id IS NOT NULL
ORDER BY p.created_at DESC;

-- ============================================================================
-- Step 2: Claim all unclaimed projects as yours
-- WARNING: This will make you owner of ALL projects without an owner
-- Only run this if you're sure these are your projects
-- ============================================================================
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT
  p.id,
  auth.uid()::TEXT,
  'owner'
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm 
  WHERE pm.project_id = p.id
)
ON CONFLICT (project_id, user_id) DO NOTHING
RETURNING project_id, role;

-- ============================================================================
-- Step 3: Verify your claimed projects
-- ============================================================================
SELECT 
  p.id,
  p.name,
  pm.role,
  pm.created_at as claimed_at
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id = auth.uid()::TEXT
ORDER BY pm.created_at DESC;
