-- ============================================================================
-- ROLLBACK: Remove All Collaboration Features
-- ============================================================================
-- This script removes all tables, functions, triggers, policies, and columns
-- added for the collaboration feature (Phase 1)
-- 
-- WARNING: This will delete all collaboration data including:
-- - All project_members entries
-- - All user_profiles entries
-- 
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. DROP TRIGGERS (must be done before functions)
-- ============================================================================

DROP TRIGGER IF EXISTS prevent_editor_drawing_updates_trigger ON document_contents;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ============================================================================
-- 2. DROP RLS POLICIES FIRST (they depend on functions, so drop before functions)
-- ============================================================================

-- Drop policies on projects
DROP POLICY IF EXISTS "Users can view projects they are members of" ON projects;
DROP POLICY IF EXISTS "Users can create projects" ON projects;
DROP POLICY IF EXISTS "Owners can update projects" ON projects;
DROP POLICY IF EXISTS "Owners can delete projects" ON projects;

-- Drop policies on documents
DROP POLICY IF EXISTS "Users can view documents in accessible projects" ON documents;
DROP POLICY IF EXISTS "Editors and Owners can create documents" ON documents;
DROP POLICY IF EXISTS "Editors and Owners can update documents" ON documents;
DROP POLICY IF EXISTS "Owners can delete documents" ON documents;

-- Drop policies on document_contents
DROP POLICY IF EXISTS "Users can view document contents they have access to" ON document_contents;
DROP POLICY IF EXISTS "Editors and Owners can create document contents" ON document_contents;
DROP POLICY IF EXISTS "Editors and Owners can update document contents" ON document_contents;
DROP POLICY IF EXISTS "Owners can delete document contents" ON document_contents;

-- Drop policies on project_members
DROP POLICY IF EXISTS "Users can view members of projects they belong to" ON project_members;
DROP POLICY IF EXISTS "Owners can add members" ON project_members;
DROP POLICY IF EXISTS "Owners can update member roles" ON project_members;
DROP POLICY IF EXISTS "Owners can remove members" ON project_members;

-- Drop policies on user_profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- ============================================================================
-- 3. DROP FUNCTIONS (now safe since policies are dropped)
-- ============================================================================

DROP FUNCTION IF EXISTS prevent_editor_drawing_updates();
DROP FUNCTION IF EXISTS get_user_project_role(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_user_document_role(INTEGER, TEXT);
DROP FUNCTION IF EXISTS user_has_project_access(TEXT, TEXT);
DROP FUNCTION IF EXISTS is_guest_only_project(TEXT);
DROP FUNCTION IF EXISTS sync_user_profile();
DROP FUNCTION IF EXISTS get_user_id_by_email(TEXT);
DROP FUNCTION IF EXISTS get_project_members_with_emails(TEXT);

-- ============================================================================
-- 4. DROP TABLES (cascade will handle foreign keys)
-- ============================================================================

DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- ============================================================================
-- 5. REMOVE COLUMNS (is_open from projects and documents)
-- ============================================================================

ALTER TABLE projects DROP COLUMN IF EXISTS is_open;
ALTER TABLE documents DROP COLUMN IF EXISTS is_open;

-- ============================================================================
-- 6. RESTORE ORIGINAL PERMISSIVE POLICIES
-- ============================================================================
-- Restore the original "Allow all for now" policies that existed before
-- collaboration features were added

-- Projects
CREATE POLICY "Allow all for now" 
ON projects FOR ALL 
USING (true) 
WITH CHECK (true);

-- Documents
CREATE POLICY "Allow all for now" 
ON documents FOR ALL 
USING (true) 
WITH CHECK (true);

-- Document Contents
CREATE POLICY "Allow all for now" 
ON document_contents FOR ALL 
USING (true) 
WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES (optional - run to verify rollback)
-- ============================================================================

-- Check if tables are dropped
SELECT 
  table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('project_members', 'user_profiles');

-- Check if functions are dropped
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_user_project_role',
    'get_user_document_role',
    'user_has_project_access',
    'is_guest_only_project',
    'prevent_editor_drawing_updates',
    'sync_user_profile',
    'get_user_id_by_email',
    'get_project_members_with_emails'
  );

-- Check if triggers are dropped
SELECT 
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'prevent_editor_drawing_updates_trigger',
    'on_auth_user_created'
  );

-- Check if columns are removed
SELECT 
  column_name,
  table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('projects', 'documents')
  AND column_name = 'is_open';

-- Check policies on projects
SELECT 
  policyname,
  tablename
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('projects', 'documents', 'document_contents');
