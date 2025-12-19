-- ============================================================================
-- Fix Guest Access for Documents and Document Contents
-- ============================================================================
-- This migration adds guest access fallback to RLS policies for documents
-- and document_contents, allowing guest users to access their projects.
--
-- Guest access works by:
-- 1. Client-side filtering by guest_id (already working)
-- 2. RLS allowing access to projects with no project_members (guest-only projects)
-- 3. When user authenticates, they can claim projects (add themselves as owner)
-- ============================================================================

-- Helper function to check if a project is guest-only (no members)
CREATE OR REPLACE FUNCTION is_guest_only_project(project_id_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 
    FROM project_members 
    WHERE project_id = project_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Update Documents RLS Policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view documents in accessible projects" ON documents;
DROP POLICY IF EXISTS "Editors and Owners can create documents" ON documents;
DROP POLICY IF EXISTS "Editors and Owners can update documents" ON documents;
DROP POLICY IF EXISTS "Owners can delete documents" ON documents;

-- SELECT: Allow authenticated users with access OR guest users accessing guest-only projects
CREATE POLICY "Users can view documents in accessible projects"
ON documents FOR SELECT
USING (
  -- Authenticated users: check project_members access
  (auth.uid() IS NOT NULL AND (
    user_has_project_access(project_id, auth.uid()::TEXT)
    AND (
      is_open = true 
      OR get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
      OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
    )
  ))
  -- Guest users: allow access to guest-only projects (no project_members)
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- INSERT: Allow authenticated users with editor/owner role OR guests on guest-only projects
CREATE POLICY "Editors and Owners can create documents"
ON documents FOR INSERT
WITH CHECK (
  -- Authenticated users: check role
  (auth.uid() IS NOT NULL AND get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor'))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- UPDATE: Allow authenticated users with editor/owner role OR guests on guest-only projects
CREATE POLICY "Editors and Owners can update documents"
ON documents FOR UPDATE
USING (
  -- Authenticated users: check role
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
)
WITH CHECK (
  -- Authenticated users: check role
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- DELETE: Allow authenticated owners OR guests on guest-only projects
CREATE POLICY "Owners can delete documents"
ON documents FOR DELETE
USING (
  -- Authenticated users: check owner role
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) = 'owner'
    OR get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- ============================================================================
-- Update Document Contents RLS Policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view document contents they have access to" ON document_contents;
DROP POLICY IF EXISTS "Editors and Owners can create document contents" ON document_contents;
DROP POLICY IF EXISTS "Editors and Owners can update document contents" ON document_contents;
DROP POLICY IF EXISTS "Owners can delete document contents" ON document_contents;

-- SELECT: Allow authenticated users with access OR guest users accessing guest-only projects
CREATE POLICY "Users can view document contents they have access to"
ON document_contents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check project_members access
        (auth.uid() IS NOT NULL AND (
          user_has_project_access(d.project_id, auth.uid()::TEXT)
          AND (
            d.is_open = true 
            OR get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
            OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
          )
        ))
        -- Guest users: allow access to guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- INSERT: Allow authenticated users with editor/owner role OR guests on guest-only projects
CREATE POLICY "Editors and Owners can create document contents"
ON document_contents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check role
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- UPDATE: Allow authenticated users with editor/owner role OR guests on guest-only projects
-- Note: The prevent_editor_drawing_updates trigger will still block editors from modifying drawings
CREATE POLICY "Editors and Owners can update document contents"
ON document_contents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check role
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check role
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- DELETE: Allow authenticated owners OR guests on guest-only projects
CREATE POLICY "Owners can delete document contents"
ON document_contents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check owner role
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) = 'owner'
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) = 'owner'
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- ============================================================================
-- Update Projects UPDATE Policy for Guests
-- ============================================================================

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Owners can update projects" ON projects;

-- UPDATE: Allow authenticated owners OR guests on guest-only projects
CREATE POLICY "Owners can update projects"
ON projects FOR UPDATE
USING (
  -- Authenticated users: check owner role
  (auth.uid() IS NOT NULL AND get_user_project_role(id, auth.uid()::TEXT) = 'owner')
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
)
WITH CHECK (
  -- Authenticated users: check owner role
  (auth.uid() IS NOT NULL AND get_user_project_role(id, auth.uid()::TEXT) = 'owner')
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
);

-- ============================================================================
-- Update Projects DELETE Policy for Guests
-- ============================================================================

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Owners can delete projects" ON projects;

-- DELETE: Allow authenticated owners OR guests on guest-only projects
CREATE POLICY "Owners can delete projects"
ON projects FOR DELETE
USING (
  -- Authenticated users: check owner role
  (auth.uid() IS NOT NULL AND get_user_project_role(id, auth.uid()::TEXT) = 'owner')
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
);
