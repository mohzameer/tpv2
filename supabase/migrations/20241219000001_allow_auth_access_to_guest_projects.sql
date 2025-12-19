-- Allow authenticated users to access guest-only projects temporarily
-- This bridges the gap between signup and auto-claiming projects
-- Once projects are claimed (have project_members), normal RLS applies
--
-- Security Note: This allows any authenticated user to access any guest-only project.
-- This is acceptable because:
-- 1. Guest-only projects are temporary (they get auto-claimed on signup)
-- 2. Once claimed, normal RLS applies
-- 3. Guest projects are typically personal and short-lived
-- 4. The auto-claim happens immediately on signup/login

-- ============================================================================
-- Update Projects SELECT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view projects they are members of" ON projects;

CREATE POLICY "Users can view projects they are members of"
ON projects FOR SELECT
USING (
  -- Authenticated users: check project_members OR allow guest-only projects
  (auth.uid() IS NOT NULL AND (
    user_has_project_access(id, auth.uid()::TEXT)
    OR is_guest_only_project(id)  -- Allow access to unclaimed guest projects
  ))
  -- Guest users: allow access (for backward compatibility)
  OR (auth.uid() IS NULL)
);

-- ============================================================================
-- Update Documents SELECT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view documents in accessible projects" ON documents;

CREATE POLICY "Users can view documents in accessible projects"
ON documents FOR SELECT
USING (
  -- Authenticated users: check project_members OR allow guest-only projects
  (auth.uid() IS NOT NULL AND (
    (
      user_has_project_access(project_id, auth.uid()::TEXT)
      AND (
        is_open = true 
        OR get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
        OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
      )
    )
    OR is_guest_only_project(project_id)  -- Allow access to unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- ============================================================================
-- Update Documents INSERT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Editors and Owners can create documents" ON documents;

CREATE POLICY "Editors and Owners can create documents"
ON documents FOR INSERT
WITH CHECK (
  -- Authenticated users: check role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR is_guest_only_project(project_id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- ============================================================================
-- Update Documents UPDATE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Editors and Owners can update documents" ON documents;

CREATE POLICY "Editors and Owners can update documents"
ON documents FOR UPDATE
USING (
  -- Authenticated users: check role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR is_guest_only_project(project_id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
)
WITH CHECK (
  -- Authenticated users: check role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
    OR is_guest_only_project(project_id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- ============================================================================
-- Update Documents DELETE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Owners can delete documents" ON documents;

CREATE POLICY "Owners can delete documents"
ON documents FOR DELETE
USING (
  -- Authenticated users: check owner role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_document_role(id, auth.uid()::TEXT) = 'owner'
    OR get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
    OR is_guest_only_project(project_id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
);

-- ============================================================================
-- Update Document Contents SELECT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view document contents they have access to" ON document_contents;

CREATE POLICY "Users can view document contents they have access to"
ON document_contents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check project_members OR allow guest-only projects
        (auth.uid() IS NOT NULL AND (
          (
            user_has_project_access(d.project_id, auth.uid()::TEXT)
            AND (
              d.is_open = true 
              OR get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
              OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
            )
          )
          OR is_guest_only_project(d.project_id)  -- Allow on unclaimed guest projects
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- ============================================================================
-- Update Document Contents INSERT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Editors and Owners can create document contents" ON document_contents;

CREATE POLICY "Editors and Owners can create document contents"
ON document_contents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check role OR allow on guest-only projects
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR is_guest_only_project(d.project_id)  -- Allow on unclaimed guest projects
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- ============================================================================
-- Update Document Contents UPDATE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Editors and Owners can update document contents" ON document_contents;

CREATE POLICY "Editors and Owners can update document contents"
ON document_contents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check role OR allow on guest-only projects
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR is_guest_only_project(d.project_id)  -- Allow on unclaimed guest projects
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
        -- Authenticated users: check role OR allow on guest-only projects
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) IN ('owner', 'editor')
          OR is_guest_only_project(d.project_id)  -- Allow on unclaimed guest projects
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- ============================================================================
-- Update Document Contents DELETE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Owners can delete document contents" ON document_contents;

CREATE POLICY "Owners can delete document contents"
ON document_contents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND (
        -- Authenticated users: check owner role OR allow on guest-only projects
        (auth.uid() IS NOT NULL AND (
          get_user_document_role(d.id, auth.uid()::TEXT) = 'owner'
          OR get_user_project_role(d.project_id, auth.uid()::TEXT) = 'owner'
          OR is_guest_only_project(d.project_id)  -- Allow on unclaimed guest projects
        ))
        -- Guest users: allow on guest-only projects
        OR (auth.uid() IS NULL AND is_guest_only_project(d.project_id))
      )
  )
);

-- ============================================================================
-- Update Projects UPDATE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Owners can update projects" ON projects;

CREATE POLICY "Owners can update projects"
ON projects FOR UPDATE
USING (
  -- Authenticated users: check owner role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_project_role(id, auth.uid()::TEXT) = 'owner'
    OR is_guest_only_project(id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
)
WITH CHECK (
  -- Authenticated users: check owner role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_project_role(id, auth.uid()::TEXT) = 'owner'
    OR is_guest_only_project(id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
);

-- ============================================================================
-- Update Projects DELETE Policy
-- ============================================================================

DROP POLICY IF EXISTS "Owners can delete projects" ON projects;

CREATE POLICY "Owners can delete projects"
ON projects FOR DELETE
USING (
  -- Authenticated users: check owner role OR allow on guest-only projects
  (auth.uid() IS NOT NULL AND (
    get_user_project_role(id, auth.uid()::TEXT) = 'owner'
    OR is_guest_only_project(id)  -- Allow on unclaimed guest projects
  ))
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(id))
);
