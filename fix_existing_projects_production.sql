-- Production Migration: Fix Existing Projects Access
-- This script migrates all existing projects to the new collaboration system
-- Safe to run multiple times (idempotent)
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Migrate projects with owner_id to project_members
-- ============================================================================
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT
  p.id,
  p.owner_id,
  'owner'
FROM projects p
WHERE p.owner_id IS NOT NULL
  AND p.owner_id != ''  -- Ensure owner_id is not empty string
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = p.id 
    AND pm.user_id = p.owner_id
  )
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ============================================================================
-- STEP 2: Ensure all existing projects and documents have is_open = true
-- ============================================================================
UPDATE projects 
SET is_open = true 
WHERE is_open IS NULL;

UPDATE documents 
SET is_open = true 
WHERE is_open IS NULL;

-- ============================================================================
-- STEP 3: For projects without owner_id, we need to identify owners
-- Option A: If you know which user should own guest projects, use this:
-- ============================================================================

-- First, let's see what projects don't have owners
SELECT 
  p.id,
  p.name,
  p.owner_id,
  p.guest_id,
  p.created_at,
  CASE 
    WHEN EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id) 
    THEN 'Has member'
    ELSE 'No members'
  END AS status
FROM projects p
WHERE p.owner_id IS NULL OR p.owner_id = ''
ORDER BY p.created_at DESC;

-- ============================================================================
-- STEP 4: If you want to assign a specific user as owner to all unclaimed projects
-- Replace 'YOUR_USER_ID_HERE' with the actual user ID from auth.users
-- To find your user ID, run: SELECT id, email FROM auth.users;
-- ============================================================================

-- Uncomment and modify the line below with your actual user ID:
/*
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT
  p.id,
  'YOUR_USER_ID_HERE'::TEXT,  -- Replace with actual user ID from auth.users
  'owner'
FROM projects p
WHERE (p.owner_id IS NULL OR p.owner_id = '')
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = p.id
  )
ON CONFLICT (project_id, user_id) DO NOTHING;
*/

-- ============================================================================
-- STEP 5: Verification queries
-- ============================================================================

-- Check migration status
SELECT 
  COUNT(*) as total_projects,
  COUNT(DISTINCT pm.project_id) as projects_with_members,
  COUNT(*) - COUNT(DISTINCT pm.project_id) as projects_without_members
FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id;

-- Show projects without any members
SELECT 
  p.id,
  p.name,
  p.owner_id,
  p.guest_id,
  p.created_at
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm WHERE pm.project_id = p.id
)
ORDER BY p.created_at DESC;

-- Show all projects with their members
SELECT 
  p.id,
  p.name,
  pm.user_id,
  pm.role,
  pm.created_at as member_since
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
ORDER BY p.created_at DESC, pm.created_at;
