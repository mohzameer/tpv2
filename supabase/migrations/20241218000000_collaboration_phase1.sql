-- Collaboration Phase 1: Basic Access Control
-- This migration adds role-based permissions and sharing functionality

-- ============================================================================
-- 1. CREATE NEW TABLES
-- ============================================================================

-- Project members junction table
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- References auth.users(id) as TEXT
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

-- ============================================================================
-- 2. ADD NEW COLUMNS
-- ============================================================================

-- Add is_open column to projects (for hiding projects from Viewers)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- Add is_open column to documents (for hiding documents from Viewers)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- ============================================================================
-- 3. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Get user's role in a project
CREATE OR REPLACE FUNCTION get_user_project_role(project_id_param TEXT, user_id_param TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM project_members 
    WHERE project_id = project_id_param 
      AND user_id = user_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's effective role for a document (with override support for future)
CREATE OR REPLACE FUNCTION get_user_document_role(document_id_param INTEGER, user_id_param TEXT)
RETURNS TEXT AS $$
DECLARE
  project_role TEXT;
  project_id_val TEXT;
BEGIN
  -- Get project role (document-level overrides can be added later)
  SELECT project_id INTO project_id_val
  FROM documents
  WHERE id = document_id_param;
  
  SELECT role INTO project_role
  FROM project_members
  WHERE project_id = project_id_val
    AND user_id = user_id_param;
  
  RETURN project_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to project
CREATE OR REPLACE FUNCTION user_has_project_access(project_id_param TEXT, user_id_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM project_members 
    WHERE project_id = project_id_param 
      AND user_id = user_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. CREATE DRAWING RESTRICTION TRIGGER
-- ============================================================================

-- Function to prevent Editors from updating drawing_content
CREATE OR REPLACE FUNCTION prevent_editor_drawing_updates()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  project_id_val TEXT;
BEGIN
  -- Get the project_id for this document
  SELECT project_id INTO project_id_val
  FROM documents
  WHERE id = NEW.document_id;
  
  -- Get user's role
  SELECT get_user_project_role(project_id_val, auth.uid()::TEXT) INTO user_role;
  
  -- If user is Editor and drawing_content is being changed, prevent it
  IF user_role = 'editor' AND (
    OLD.drawing_content IS DISTINCT FROM NEW.drawing_content
    OR (OLD.drawing_content IS NULL AND NEW.drawing_content IS NOT NULL)
    OR (OLD.drawing_content IS NOT NULL AND NEW.drawing_content IS NULL)
  ) THEN
    RAISE EXCEPTION 'Editors cannot modify drawing_content. Only Owners can update drawings.';
  END IF;
  
  -- Allow the update to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER prevent_editor_drawing_updates_trigger
BEFORE UPDATE ON document_contents
FOR EACH ROW
EXECUTE FUNCTION prevent_editor_drawing_updates();

-- ============================================================================
-- 5. ENABLE RLS ON NEW TABLE
-- ============================================================================

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. DROP OLD PERMISSIVE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Allow all for now" ON projects;
DROP POLICY IF EXISTS "Allow all for now" ON documents;
DROP POLICY IF EXISTS "Allow all for now" ON document_contents;

-- ============================================================================
-- 7. CREATE RLS POLICIES FOR PROJECTS
-- ============================================================================

-- SELECT: Users can view projects they are members of
CREATE POLICY "Users can view projects they are members of"
ON projects FOR SELECT
USING (
  -- Authenticated users: check project_members
  (auth.uid() IS NOT NULL AND user_has_project_access(id, auth.uid()::TEXT))
  -- Guest users: allow access (for backward compatibility)
  OR (auth.uid() IS NULL)
);

-- INSERT: Users can create projects
CREATE POLICY "Users can create projects"
ON projects FOR INSERT
WITH CHECK (true); -- Allow creation, project_members entry created separately

-- UPDATE: Owners can update projects
CREATE POLICY "Owners can update projects"
ON projects FOR UPDATE
USING (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
)
WITH CHECK (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
);

-- DELETE: Owners can delete projects
CREATE POLICY "Owners can delete projects"
ON projects FOR DELETE
USING (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
);

-- ============================================================================
-- 8. CREATE RLS POLICIES FOR DOCUMENTS
-- ============================================================================

-- SELECT: Users can view documents in accessible projects
CREATE POLICY "Users can view documents in accessible projects"
ON documents FOR SELECT
USING (
  user_has_project_access(project_id, auth.uid()::TEXT)
  AND (
    is_open = true 
    OR get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
  )
);

-- INSERT: Editors and Owners can create documents
CREATE POLICY "Editors and Owners can create documents"
ON documents FOR INSERT
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
);

-- UPDATE: Editors and Owners can update documents
CREATE POLICY "Editors and Owners can update documents"
ON documents FOR UPDATE
USING (
  get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
  OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
)
WITH CHECK (
  get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
  OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
);

-- DELETE: Owners can delete documents
CREATE POLICY "Owners can delete documents"
ON documents FOR DELETE
USING (
  get_user_document_role(id, auth.uid()::TEXT) = 'owner'
  OR get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
);

-- ============================================================================
-- 9. CREATE RLS POLICIES FOR DOCUMENT CONTENTS
-- ============================================================================

-- SELECT: Users can view document contents they have access to
CREATE POLICY "Users can view document contents they have access to"
ON document_contents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND user_has_project_access(d.project_id, auth.uid()::TEXT)
      AND (
        d.is_open = true 
        OR get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
        OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
      )
  )
);

-- INSERT: Editors and Owners can create document contents
CREATE POLICY "Editors and Owners can create document contents"
ON document_contents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
        OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
      )
  )
);

-- UPDATE: Editors and Owners can update document contents
CREATE POLICY "Editors and Owners can update document contents"
ON document_contents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
        OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
        OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
      )
  )
);

-- DELETE: Owners can delete document contents
CREATE POLICY "Owners can delete document contents"
ON document_contents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        get_user_document_role(d.id, auth.uid()::TEXT) = 'owner'
        OR get_user_project_role(d.project_id, auth.uid()::TEXT) = 'owner'
      )
  )
);

-- ============================================================================
-- 10. CREATE RLS POLICIES FOR PROJECT MEMBERS
-- ============================================================================

-- SELECT: Users can view members of projects they belong to
CREATE POLICY "Users can view members of projects they belong to"
ON project_members FOR SELECT
USING (
  user_has_project_access(project_id, auth.uid()::TEXT)
);

-- INSERT: Owners can add members
CREATE POLICY "Owners can add members"
ON project_members FOR INSERT
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
);

-- UPDATE: Owners can update member roles
-- Note: The constraint preventing non-owners from assigning owner role is handled
-- in application logic. RLS policies can't easily check OLD vs NEW values.
CREATE POLICY "Owners can update member roles"
ON project_members FOR UPDATE
USING (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
)
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
);

-- DELETE: Owners can remove members
CREATE POLICY "Owners can remove members"
ON project_members FOR DELETE
USING (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
  -- Prevent removing last owner
  AND (
    role != 'owner'
    OR EXISTS (
      SELECT 1 FROM project_members pm2
      WHERE pm2.project_id = project_members.project_id
        AND pm2.role = 'owner'
        AND pm2.user_id != project_members.user_id
    )
  )
);

-- ============================================================================
-- 11. DATA MIGRATION
-- ============================================================================

-- Migrate existing projects with owner_id to project_members
-- Note: This only runs if owner_id exists and is not null
INSERT INTO project_members (project_id, user_id, role)
SELECT id, owner_id, 'owner'
FROM projects
WHERE owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = projects.id 
      AND pm.user_id = projects.owner_id
  )
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Set is_open = true for all existing projects and documents (default)
UPDATE projects SET is_open = true WHERE is_open IS NULL;
UPDATE documents SET is_open = true WHERE is_open IS NULL;

-- ============================================================================
-- 12. HELPER FUNCTION FOR EMAIL LOOKUP
-- ============================================================================

-- Function to get user_id from email (for adding members)
-- Note: This requires SECURITY DEFINER to access auth.users
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_param TEXT)
RETURNS TEXT AS $$
DECLARE
  user_id_val TEXT;
BEGIN
  SELECT id::TEXT INTO user_id_val
  FROM auth.users
  WHERE email = email_param
  LIMIT 1;
  
  RETURN user_id_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
