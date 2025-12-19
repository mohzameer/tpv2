# Collaboration Feature Specification - Phase 1: Basic Access Control

## Overview
This specification defines **Phase 1** of the collaboration feature for ThinkPost: a robust role-based permission system with Row Level Security (RLS). This phase establishes the foundation for multi-user access control before implementing real-time collaboration.

## Goals
- Lock everything down with proper roles and Row Level Security (RLS)
- Support role-based permissions with inheritance from projects to documents
- Enable project sharing with role management
- Provide foundation for Phase 2 (real-time collaboration)

## Phase Overview
- **Phase 1** (Current): Basic access control and permission system
- **Phase 2** (Future): Real-time text collaboration with Y-Sweet/Yjs
- **Phase 3+** (Future): Comments system, advanced features

## Phase 1 Quick Reference

**What's Included:**
- ✅ Role-based permissions (Owner, Editor, Viewer)
- ✅ Project sharing via `project_members` table
- ✅ Row Level Security (RLS) policies for all tables
- ✅ Sharing modal UI for member management
- ✅ Client-side UI enforcement based on roles
- ✅ Document visibility control (`is_open` flag)
- ✅ Optional per-document role overrides (Phase 1.5)
- ✅ **Comprehensive testing UI** to visually verify permissions:
  - Role badges and indicators throughout UI
  - Read-only mode with clear visual feedback
  - Member list display with roles
  - Permission debug panel (dev mode)
  - Visual indicators for allowed/disabled actions
  - Document access filtering and visibility indicators

**What's NOT Included (Future Phases):**
- ❌ Real-time text collaboration (Phase 2)
- ❌ Comments system (Phase 3)
- ❌ Drawing tool collaboration restrictions (Phase 2)
- ❌ Presence/cursor tracking (Phase 2)

---

## 1. Roles & Permissions

### 1.1 Role Definitions

#### Owner
- **Full control** over project and all documents
- Can edit, delete, and manage sharing
- Can override document-level permissions
- Can transfer ownership (only current owner can transfer)
- Can manage project members (add/remove users, assign roles)
- Can toggle project-level settings (e.g., enable comments)
- Can delete project

#### Editor
- **Edit access** to all documents in project
- Can create new documents
- Can edit document content (notes and drawing)
- Cannot delete project
- Cannot manage project members
- Cannot override document permissions
- Cannot delete documents (only Owners can delete)

#### Viewer
- **Read-only** access to documents
- Can view document content (notes and drawing)
- Cannot create, edit, or delete documents
- Cannot access non-open documents (`is_open = false`)
- Cannot edit document contents

### 1.2 Permission Inheritance

- **Default behavior**: Permissions inherit from project to documents
- **New documents**: Automatically inherit project-level permissions
- **Override mechanism**: Optional per-document role override (Owner only)
- **Document-level override**: Can restrict Editor to Viewer, or Viewer to Editor (Owner only)

---

## 2. Database Schema

### 2.1 New Tables

#### `project_members` (Junction Table)
```sql
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- References auth.users(id)
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
```

**Notes:**
- `user_id` references Supabase `auth.users(id)` (UUID, but stored as TEXT for consistency)
- Unique constraint ensures one role per user per project
- Cascade delete removes members when project is deleted

#### `document_permissions` (Optional Override Table - Phase 1.5)
```sql
CREATE TABLE document_permissions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- References auth.users(id)
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

CREATE INDEX idx_document_permissions_document_id ON document_permissions(document_id);
CREATE INDEX idx_document_permissions_user_id ON document_permissions(user_id);
```

**Notes:**
- Only `editor` and `viewer` roles allowed (no `owner` override)
- Used to override project-level permissions for specific documents
- If no override exists, user inherits project role
- **Phase 1.5**: Can be implemented after core sharing is working

### 2.2 Schema Modifications

#### `projects` Table
Add new column:
```sql
ALTER TABLE projects 
ADD COLUMN is_open BOOLEAN DEFAULT true; -- For hiding documents from Viewers
```

**Notes:**
- `is_open`: Controls visibility of documents (Viewers can only see open documents)
- `comments_enabled` will be added in Phase 3 (comments system)

#### `documents` Table
Add new column:
```sql
ALTER TABLE documents 
ADD COLUMN is_open BOOLEAN DEFAULT true; -- For hiding documents from Viewers
```

**Notes:**
- `is_open`: Controls document visibility for Viewers
- Defaults to `true` for backward compatibility

---

## 3. Row Level Security (RLS) Policies

### 3.1 Helper Functions

Create helper functions to check user roles:

```sql
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

-- Get user's effective role for a document (with override)
CREATE OR REPLACE FUNCTION get_user_document_role(document_id_param INTEGER, user_id_param TEXT)
RETURNS TEXT AS $$
DECLARE
  override_role TEXT;
  project_role TEXT;
  project_id_val TEXT;
BEGIN
  -- Check for document-level override
  SELECT role INTO override_role
  FROM document_permissions
  WHERE document_id = document_id_param 
    AND user_id = user_id_param;
  
  IF override_role IS NOT NULL THEN
    RETURN override_role;
  END IF;
  
  -- Get project role
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
```

### 3.2 Projects Table Policies

**Drop existing permissive policies first:**
```sql
DROP POLICY IF EXISTS "Allow all for now" ON projects;
```

**SELECT Policy:**
```sql
CREATE POLICY "Users can view projects they are members of"
ON projects FOR SELECT
USING (
  -- Authenticated users: check project_members
  (auth.uid() IS NOT NULL AND user_has_project_access(id, auth.uid()::TEXT))
  -- Guest users: allow access via guest_id (client-side filtering continues to work)
  -- Note: Guest projects don't support collaboration features
  OR (auth.uid() IS NULL)
);
```

**Note:** 
- Authenticated users must be in `project_members` to access projects
- Guest access (via `guest_id`) continues to work for backward compatibility but doesn't support collaboration
- Collaboration features (sharing, roles) require authentication and `project_members` entries

**INSERT Policy:**
```sql
CREATE POLICY "Users can create projects"
ON projects FOR INSERT
WITH CHECK (true); -- Allow creation, but project_members entry created separately
```

**Note:** Project creation is allowed, but the `createProject` function should automatically create the `project_members` entry for authenticated users.

**UPDATE Policy:**
```sql
CREATE POLICY "Owners can update projects"
ON projects FOR UPDATE
USING (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
)
WITH CHECK (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
);
```

**DELETE Policy:**
```sql
CREATE POLICY "Owners can delete projects"
ON projects FOR DELETE
USING (
  get_user_project_role(id, auth.uid()::TEXT) = 'owner'
);
```

### 3.3 Documents Table Policies

**Drop existing permissive policies first:**
```sql
DROP POLICY IF EXISTS "Allow all for now" ON documents;
```

**SELECT Policy:**
```sql
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
```

**INSERT Policy:**
```sql
CREATE POLICY "Editors and Owners can create documents"
ON documents FOR INSERT
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) IN ('owner', 'editor')
);
```

**UPDATE Policy:**
```sql
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
```

**DELETE Policy:**
```sql
CREATE POLICY "Owners can delete documents"
ON documents FOR DELETE
USING (
  get_user_document_role(id, auth.uid()::TEXT) = 'owner'
  OR get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
);
```

### 3.4 Document Contents Table Policies

**Drop existing permissive policies first:**
```sql
DROP POLICY IF EXISTS "Allow all for now" ON document_contents;
```

**SELECT Policy:**
```sql
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
```

**INSERT Policy:**
```sql
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
```

**UPDATE Policy:**
```sql
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
```

**DELETE Policy:**
```sql
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
```

### 3.4.1 Drawing Content Restriction Trigger

**Problem:** RLS policies work at the row level, not column level. The UPDATE policy allows Editors to update the entire `document_contents` row, including `drawing_content`. We need to restrict `drawing_content` updates to Owners only.

**Solution:** Use a database trigger to validate which columns are being updated and block `drawing_content` changes for Editors.

```sql
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
```

**How it works:**
1. **Editors can update `notes_content`**: The RLS UPDATE policy allows it, and the trigger doesn't block it
2. **Editors cannot update `drawing_content`**: The trigger detects when `drawing_content` changes and raises an exception if user is Editor
3. **Owners can update both**: The trigger only blocks Editors, Owners pass through
4. **Other fields**: Editors can update `layout_mode`, `layout_ratio`, `text_mode` (not restricted)

**Alternative: Application-Level Validation**

If you prefer application-level control (less secure but more flexible), you can validate in the API:

```javascript
// In src/lib/api.js
export async function updateDocumentContent(documentId, updates) {
  const userRole = await getUserRole(projectId);
  
  // If Editor, remove drawing_content from updates
  if (userRole === 'editor' && 'drawing_content' in updates) {
    delete updates.drawing_content;
    // Optionally show warning to user
  }
  
  // Proceed with update
  const { data, error } = await supabase
    .from('document_contents')
    .update(updates)
    .eq('document_id', documentId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

**Recommendation:** Use the database trigger for security (defense in depth), and also add client-side UI restrictions (disable drawing tool for Editors).

### 3.4.2 Permission Summary: Text vs Drawing

**How Editors can change text:**
1. RLS UPDATE policy on `document_contents` allows Editors to update the row
2. Editor calls `updateDocumentContent()` with `notes_content` changes
3. Database trigger checks if `drawing_content` is being modified (it's not)
4. Update succeeds - `notes_content` is updated

**How drawing changes are limited:**
1. **Database Level (Primary Security):**
   - Trigger `prevent_editor_drawing_updates()` runs BEFORE UPDATE
   - Checks if user role is 'editor' AND `drawing_content` is being changed
   - Raises exception if both conditions true → update is blocked
   - Only Owners can update `drawing_content` (trigger doesn't block them)

2. **Application Level (Secondary Security):**
   - API function `updateDocumentContent()` can filter out `drawing_content` for Editors
   - Prevents unnecessary database calls

3. **Client Level (UX):**
   - Drawing tool UI disabled/hidden for Editors
   - Shows message explaining restriction
   - Prevents user from attempting to edit drawings

**Permission Matrix:**

| Role | Edit Text (`notes_content`) | Edit Drawing (`drawing_content`) | Delete Documents |
|------|----------------------------|----------------------------------|------------------|
| Owner | ✅ Yes | ✅ Yes | ✅ Yes |
| Editor | ✅ Yes | ❌ No (trigger blocks) | ❌ No |
| Viewer | ❌ No (read-only) | ❌ No (read-only) | ❌ No |

### 3.4.3 Future: Enabling Drawing for Editors

**If you want to allow Editors to edit drawings later, here's what needs to change:**

#### 1. Remove Database Trigger (Required)
```sql
-- Drop the trigger
DROP TRIGGER IF EXISTS prevent_editor_drawing_updates_trigger ON document_contents;

-- Optionally drop the function (or keep it for future use)
DROP FUNCTION IF EXISTS prevent_editor_drawing_updates();
```

**Note:** The RLS UPDATE policy already allows Editors to update `document_contents`, so no RLS changes needed.

#### 2. Update Client-Side Permission Helpers
**File:** `src/lib/permissions.js`
```javascript
// Change from:
export function canEditDrawing(userRole) {
  return userRole === 'owner';
}

// To:
export function canEditDrawing(userRole) {
  return ['owner', 'editor'].includes(userRole);
}
```

#### 3. Update UI Components
**Remove drawing restrictions:**
- Remove drawing tool disable logic for Editors
- Remove "Drawing tool is only available to Owners" message
- Update permission indicators to show Editors can edit drawings
- Update `PermissionIndicator` component

**Files to update:**
- `src/components/DocumentPage.jsx` (or wherever drawing tool is rendered)
- `src/components/PermissionIndicator.jsx`
- Any components that check `canEditDrawing()`

#### 4. Update API Functions (if validation exists)
**File:** `src/lib/api.js`
```javascript
// Remove any filtering of drawing_content for Editors
// The function should allow Editors to update drawing_content
export async function updateDocumentContent(documentId, updates) {
  // Remove any role-based filtering of drawing_content
  // Just update whatever is passed in
  const { data, error } = await supabase
    .from('document_contents')
    .update(updates)
    .eq('document_id', documentId)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

#### 5. Update Documentation & Tests
- Update permission matrix in docs
- Update test cases to reflect new permissions
- Update UI testing checklist

#### 6. Migration Script (Optional)
If you want to make this configurable per-project or per-document:
```sql
-- Option 1: Add project-level setting
ALTER TABLE projects 
ADD COLUMN allow_editor_drawing BOOLEAN DEFAULT false;

-- Option 2: Add document-level setting
ALTER TABLE documents 
ADD COLUMN allow_editor_drawing BOOLEAN DEFAULT false;

-- Then update trigger to check this setting:
CREATE OR REPLACE FUNCTION prevent_editor_drawing_updates()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  project_id_val TEXT;
  allow_drawing BOOLEAN;
BEGIN
  SELECT project_id INTO project_id_val
  FROM documents
  WHERE id = NEW.document_id;
  
  SELECT get_user_project_role(project_id_val, auth.uid()::TEXT) INTO user_role;
  
  -- Check if drawing is allowed for editors (project or document level)
  SELECT COALESCE(
    (SELECT allow_editor_drawing FROM documents WHERE id = NEW.document_id),
    (SELECT allow_editor_drawing FROM projects WHERE id = project_id_val),
    false
  ) INTO allow_drawing;
  
  -- If editor and drawing not allowed and drawing_content is changing
  IF user_role = 'editor' AND NOT allow_drawing AND (
    OLD.drawing_content IS DISTINCT FROM NEW.drawing_content
  ) THEN
    RAISE EXCEPTION 'Drawing edits are not enabled for Editors in this project/document.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Summary of Changes:**
1. ✅ Drop trigger (required)
2. ✅ Update `canEditDrawing()` helper (required)
3. ✅ Remove UI restrictions (required)
4. ✅ Update API if needed (if validation exists)
5. ✅ Update tests and docs (required)
6. ⚠️ Optional: Make it configurable per-project/document

**No RLS policy changes needed** - they already allow Editors to update `document_contents`.

### 3.5 Project Members Table Policies

**SELECT Policy:**
```sql
CREATE POLICY "Users can view members of projects they belong to"
ON project_members FOR SELECT
USING (
  user_has_project_access(project_id, auth.uid()::TEXT)
);
```

**INSERT Policy:**
```sql
CREATE POLICY "Owners can add members"
ON project_members FOR INSERT
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
);
```

**UPDATE Policy:**
```sql
CREATE POLICY "Owners can update member roles"
ON project_members FOR UPDATE
USING (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
)
WITH CHECK (
  get_user_project_role(project_id, auth.uid()::TEXT) = 'owner'
  -- Prevent non-owners from assigning owner role
  AND (
    role != 'owner' 
    OR OLD.role = 'owner' -- Allow owner to transfer ownership
  )
);
```

**DELETE Policy:**
```sql
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
```

### 3.6 Document Permissions Table Policies

**SELECT Policy:**
```sql
CREATE POLICY "Users can view permissions for documents they have access to"
ON document_permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND user_has_project_access(d.project_id, auth.uid()::TEXT)
  )
);
```

**INSERT/UPDATE/DELETE Policies:**
```sql
CREATE POLICY "Owners can manage document permissions"
ON document_permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND get_user_project_role(d.project_id, auth.uid()::TEXT) = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_id
      AND get_user_project_role(d.project_id, auth.uid()::TEXT) = 'owner'
  )
);
```

---

**Note:** Comments table and policies will be added in Phase 3.

---

## 4. Client-Side Implementation

### 4.1 Sharing Modal Component

**Location:** `src/components/SharingModal.jsx`

**Features:**
- Display list of project members with roles
- Add users to project (by email)
- Remove users from project
- Change user roles (Owner can only transfer ownership)
- Show current user's role
- Prevent removing last owner
- Show user email/name for each member

**API Functions Needed:**
```javascript
// In src/lib/api.js
export async function getProjectMembers(projectId)
export async function addProjectMember(projectId, userEmail, role)
export async function removeProjectMember(projectId, userId)
export async function updateProjectMemberRole(projectId, userId, newRole)
export async function getUserRole(projectId) // Get current user's role
export async function getUserByEmail(email) // Helper to find user by email
```

### 4.2 UI Enforcement & Testing UI

#### Document Editor UI
- **Role Badge**: Display current user's role prominently in header (Owner/Editor/Viewer)
- **Read-only Mode**: 
  - Clear visual indicator when in read-only mode (Viewer role)
  - Disable all edit controls (BlockNote editor in read-only mode)
  - Show banner: "You are viewing this document in read-only mode"
- **Edit Controls**:
  - Disable delete document button for non-owners
  - Disable document settings/rename for Viewers
  - Show tooltips explaining why actions are disabled
- **Drawing Tool Restrictions**:
  - **For Editors**: Disable drawing tool completely (hide or disable UI)
  - Show message: "Drawing tool is only available to Owners"
  - **For Viewers**: Drawing tool already disabled (read-only mode)
  - **For Owners**: Drawing tool fully enabled
- **Permission Indicators**: 
  - Icon badges showing what actions are allowed (✓ Edit Text, ✓ Edit Drawing, ✓ Delete, etc.)
  - Color coding: Green (allowed), Gray (disabled), Red (forbidden)
  - Show specific permissions: "Can edit text" vs "Can edit drawing"

#### Document List UI
- **Access Filtering**: 
  - Viewers only see documents where `is_open = true`
  - Show count: "Showing X of Y documents" (if some are hidden)
- **Visual Indicators**:
  - Lock icon (🔒) for closed documents (if visible to user)
  - Role badge next to each document (if per-document override exists)
  - Access level indicator (Owner/Editor/Viewer)
- **Action Buttons**:
  - Hide "Create Document" button for Viewers
  - Show tooltip: "Only Editors and Owners can create documents"
  - Disable delete for non-owners with visual feedback

#### Project Header/Info UI
- **Sharing Button**: 
  - Only visible to Owners
  - Show member count badge: "3 members"
  - Icon: Users/Share icon
- **Member List Display** (in project header or sidebar):
  - Show all project members with their roles
  - Display user email/name
  - Show current user highlighted
  - Role badges: Owner (crown icon), Editor (pencil), Viewer (eye)
- **Project Access Status**:
  - Show current user's role prominently
  - Display: "You are the Owner" / "You are an Editor" / "You are a Viewer"
  - Show what permissions you have (checklist format)

#### Testing/Debug UI (Development Mode)
- **Permission Debug Panel** (toggleable, dev-only):
  - Show current user ID
  - Show current user's role in project
  - Show all project members with roles
  - Show document access status for each document
  - Show RLS policy test results (what would be allowed/denied)
  - List of documents user can/cannot see
  - Show `is_open` status for each document
- **Role Switcher** (dev-only, for testing):
  - Temporarily simulate different roles
  - Test UI behavior without changing actual database
  - Clear visual indicator when in "test mode"

#### Sharing Modal UI (Detailed)
- **Member List**:
  - Table/grid showing all members
  - Columns: Email, Role, Actions
  - Role dropdown (for Owners to change roles)
  - Remove button (for Owners)
  - Highlight current user's row
- **Add Member Section**:
  - Email input field
  - Role selector (Editor/Viewer - Owner can only be transferred)
  - "Add Member" button
  - Validation: check if user exists, show error if not found
- **Owner Transfer**:
  - Special section for transferring ownership
  - Warning message about ownership transfer
  - Confirmation dialog
- **Visual Feedback**:
  - Success/error messages for all actions
  - Loading states during API calls
  - Disable buttons during operations

### 4.3 Permission Helpers

**Location:** `src/lib/permissions.js`

```javascript
// Helper functions to check permissions client-side
export function canEditDocument(userRole) {
  return ['owner', 'editor'].includes(userRole);
}

export function canDeleteDocument(userRole) {
  return userRole === 'owner';
}

export function canManageMembers(userRole) {
  return userRole === 'owner';
}

export function canCreateDocuments(userRole) {
  return ['owner', 'editor'].includes(userRole);
}

export function canViewDocument(userRole, isOpen) {
  if (isOpen) return true;
  return ['owner', 'editor'].includes(userRole);
}

export function canEditDrawing(userRole) {
  return userRole === 'owner';
}

export function canEditText(userRole) {
  return ['owner', 'editor'].includes(userRole);
}
```

### 4.4 Context Updates

**Update `ProjectContext.jsx`:**
- Add current user's role to context
- Add member list to context
- Provide helper functions for permission checks
- Load user role on project load
- Subscribe to member changes (realtime)
- Add loading states for role/member data

### 4.5 Testing UI Components

#### PermissionDebugPanel (Development Mode)
**Location:** `src/components/PermissionDebugPanel.jsx`

**Features:**
- Toggleable panel (show/hide button)
- Display current user information:
  - User ID
  - User email
  - Current role in project
- Display project members:
  - List all members with roles
  - Show which member is current user
- Display document access:
  - List all documents in project
  - Show `is_open` status for each
  - Show if user can access each document
  - Show user's effective role for each document
- RLS test results:
  - Show what operations would be allowed/denied
  - Test SELECT, INSERT, UPDATE, DELETE for each table

**Usage:**
```jsx
// Only show in development
{process.env.NODE_ENV === 'development' && (
  <PermissionDebugPanel projectId={projectId} />
)}
```

#### RoleBadge Component
**Location:** `src/components/RoleBadge.jsx`

**Features:**
- Display role with icon and color:
  - Owner: Crown icon, gold color
  - Editor: Pencil icon, blue color
  - Viewer: Eye icon, gray color
- Tooltip showing role permissions
- Size variants (small, medium, large)

#### PermissionIndicator Component
**Location:** `src/components/PermissionIndicator.jsx`

**Features:**
- Show checklist of allowed actions:
  - ✓ Can edit
  - ✓ Can delete
  - ✓ Can share
  - ✗ Cannot create documents
- Color coding:
  - Green checkmark for allowed
  - Gray X for not allowed
- Compact display (can be collapsed/expanded)

#### ReadOnlyBanner Component
**Location:** `src/components/ReadOnlyBanner.jsx`

**Features:**
- Prominent banner at top of document editor
- Message: "You are viewing this document in read-only mode"
- Icon: Lock icon
- Color: Yellow/amber for attention
- Dismissible (optional)

#### MemberList Component
**Location:** `src/components/MemberList.jsx`

**Features:**
- Display all project members
- Show email/name, role badge, actions
- Highlight current user
- Show "You" label for current user
- Compact view for sidebar, expanded for modal

---

## 5. Phase 2: Real-Time Collaboration (Future)

**Note:** Phase 2 will be implemented after Phase 1 is complete and tested.

### 5.1 Overview
Enable live multi-user editing for text only using Y-Sweet + Yjs.

### 5.2 Infrastructure
- Deploy Y-Sweet server on Fly.io (small always-on VM)
- Set up S3-compatible storage (Backblaze or Supabase Storage)
- Create Supabase Edge Function for Y-Sweet auth tokens:
  - Validate user via Supabase auth
  - Check RLS-style permissions for the specific document
  - Issue signed token if allowed

### 5.3 Frontend Integration
- Integrate Yjs + provider in frontend
- Only initialize collaboration if user role ≥ Editor
- Viewers connect read-only (see cursors, no edits)
- Use document ID as room name
- Periodic snapshot persistence to Supabase (for recovery/search)
- Client-side: Disable drawing tool when >1 user online (or when collab active)
- Presence: Show user list + cursors (Yjs awareness)

### 5.4 Milestone
Two Editors can edit the same document simultaneously with live updates, no conflicts. Viewer sees changes live but can't edit. Unauthorized user can't connect.

---

## 7. Migration Strategy

### 7.1 Data Migration

1. **Create new tables** (`project_members`, optionally `document_permissions`)
2. **Add new columns** to existing tables (`is_open` on projects and documents)
3. **Migrate existing projects:**
   - For each project with `owner_id` (if any), create `project_members` entry with role 'owner'
   - For projects with only `guest_id` (no authenticated owner):
     - These will need to be handled separately (user must claim project or it remains guest-only)
     - Or: if user is authenticated and matches guest_id pattern, create owner entry
   - Set `is_open = true` for all existing projects and documents
   - Ensure all existing projects that should have owners have at least one owner in `project_members`

**Note:** Since `owner_id` is not currently used in client code, most existing projects likely only have `guest_id`. The migration should handle both cases gracefully.

### 7.2 Migration Strategy

**Approach: Use `project_members` only, no `owner_id` fallback**

- RLS policies use `project_members` table exclusively
- `owner_id` column remains in schema (nullable) for backward compatibility but is not used
- When creating new projects, always create corresponding `project_members` entry with role 'owner'
- Existing projects with `owner_id` are migrated to `project_members` during migration
- Guest-only projects (no authenticated user) remain accessible via `guest_id` until claimed

---

## 8. Phase 1 Implementation Steps

### Step 1: Database Schema (Migration)
1. Create `project_members` table
2. Optionally create `document_permissions` table (Phase 1.5)
3. Add `is_open` column to `projects` and `documents` tables
4. Create helper functions (`get_user_project_role`, `get_user_document_role`, `user_has_project_access`)
5. Create trigger function `prevent_editor_drawing_updates()` to restrict drawing changes
6. Create trigger on `document_contents` to enforce drawing restrictions
7. Migrate existing data (create owner entries in `project_members`)

**Note:** The drawing restriction trigger can be easily removed later if you want to enable drawing for Editors. See Section 3.4.3 for details.

### Step 2: Row Level Security
1. Drop existing permissive policies
2. Implement RLS policies for `projects` table
3. Implement RLS policies for `documents` table
4. Implement RLS policies for `document_contents` table
5. Implement RLS policies for `project_members` table
6. Optionally implement RLS policies for `document_permissions` table

### Step 3: API Functions
1. Implement `getProjectMembers(projectId)`
2. Implement `addProjectMember(projectId, userEmail, role)`
3. Implement `removeProjectMember(projectId, userId)`
4. Implement `updateProjectMemberRole(projectId, userId, newRole)`
5. Implement `getUserRole(projectId)`
6. Implement `getUserByEmail(email)` helper
7. **Update `createProject(name)`:**
   - After creating project, automatically create `project_members` entry
   - Set current authenticated user as 'owner'
   - Handle guest projects (if no auth user, project remains guest-only)

### Step 4: Sharing Modal UI
1. Create `SharingModal.jsx` component
2. Display member list with roles
3. Add user input (email) and role selector
4. Implement add/remove member actions
5. Implement role change actions
6. Add validation (prevent removing last owner)
7. Add sharing button to project UI (Owner only)
8. Add member count badge to sharing button
9. Implement owner transfer UI with confirmation
10. Add success/error toast notifications

### Step 5: Client-Side Enforcement & Testing UI
1. **Create reusable UI components:**
   - `RoleBadge.jsx` - Display role with icon/color
   - `PermissionIndicator.jsx` - Show allowed/disabled actions
   - `ReadOnlyBanner.jsx` - Banner for read-only mode
   - `MemberList.jsx` - Display project members
   - `PermissionDebugPanel.jsx` - Debug panel (dev mode)

2. **Update ProjectContext:**
   - Load and track user role
   - Load member list
   - Provide helper functions for permission checks
   - Add loading states

3. **Update document editor:**
   - Add role badge in header
   - Implement read-only mode for Viewers (BlockNote read-only)
   - Add "Read-only" banner component for Viewers
   - Disable delete/settings buttons based on role
   - **Disable drawing tool for Editors** (hide or disable UI)
   - Show message explaining drawing restriction for Editors
   - Add permission indicator component
   - Add tooltips to disabled buttons

4. **Update document list:**
   - Filter documents by `is_open` for Viewers
   - Add lock icons for closed documents
   - Hide "Create Document" button for Viewers
   - Show document count (visible vs total)
   - Add role badge next to each document (if needed)

5. **Project header/sidebar:**
   - Add sharing button (Owner only) with member count badge
   - Display member list component with roles
   - Show current user's role prominently
   - Add project access status display
   - Add permission indicator

6. **Testing/Debug UI (dev mode):**
   - Create permission debug panel component
   - Show current role, members, document access
   - Add toggle button to show/hide debug panel
   - Display RLS test results

7. **Visual feedback:**
   - Add tooltips explaining disabled actions
   - Color code permission states (green/gray/red)
   - Show success/error toast messages for all actions
   - Add loading states during API calls

### Step 6: Testing & Validation
1. Test all permission scenarios
2. Test sharing functionality
3. Test RLS policies (try unauthorized access)
4. Test backward compatibility with `owner_id`
5. Validate data migration

---

## 9. Phase 1 Testing Checklist

### 9.1 Permission Tests
- [ ] Owner can manage all aspects (edit, delete, share)
- [ ] Editor can edit documents but not delete/manage members
- [ ] Viewer can only read documents (no edit/delete)
- [ ] Non-members cannot access projects (RLS blocks)
- [ ] Closed documents (`is_open = false`) hidden from Viewers
- [ ] Viewers cannot create new documents
- [ ] Editors can create documents
- [ ] Only Owners can delete documents

### 9.2 Sharing Tests
- [ ] Owner can add members by email
- [ ] Owner can remove members
- [ ] Owner can change member roles
- [ ] Owner transfer works correctly (only current owner can transfer)
- [ ] Last owner cannot be removed (validation works)
- [ ] Non-owners cannot access sharing modal
- [ ] Member list displays correctly with roles
- [ ] User email lookup works

### 9.3 RLS Policy Tests
- [ ] Unauthorized users cannot SELECT projects they're not members of
- [ ] Unauthorized users cannot UPDATE projects
- [ ] Viewers cannot UPDATE document_contents
- [ ] Editors can UPDATE document_contents (notes_content, layout, etc.)
- [ ] Editors cannot UPDATE drawing_content (trigger blocks it)
- [ ] Owners can UPDATE both notes_content and drawing_content
- [ ] Viewers cannot INSERT new documents
- [ ] Only Owners can DELETE documents
- [ ] Only Owners can manage project_members
- [ ] New projects automatically create owner entry in `project_members`
- [ ] Drawing update trigger raises exception for Editors
- [ ] Drawing update trigger allows updates for Owners

### 9.4 UI Enforcement Tests
- [ ] Viewers see read-only mode in document editor
- [ ] "Read-only" banner visible for Viewers
- [ ] Role badge displays correctly (Owner/Editor/Viewer)
- [ ] Edit buttons disabled for Viewers
- [ ] Delete buttons only visible to Owners
- [ ] Sharing button only visible to Owners
- [ ] Member count badge shows correct number
- [ ] Document list filtered correctly for Viewers (only `is_open = true`)
- [ ] Document count shows "X of Y documents" for Viewers
- [ ] Lock icons appear on closed documents (when visible)
- [ ] Role indicators display correctly throughout UI
- [ ] Create document button hidden for Viewers
- [ ] Tooltips explain why actions are disabled
- [ ] Permission indicators show correct allowed actions
- [ ] Member list displays all members with correct roles
- [ ] Current user highlighted in member list
- [ ] Project access status shows correct role

### 9.5 Visual Testing Checklist
- [ ] Can visually verify who can access which documents
- [ ] Can see role-based UI restrictions clearly
- [ ] Can test different roles and see UI changes
- [ ] Can verify document visibility (open vs closed)
- [ ] Can see member list and roles at a glance
- [ ] Can verify sharing functionality works
- [ ] Can see permission states (allowed/disabled/forbidden) clearly

### 9.6 Visual Testing Guide

**Testing Setup:**
1. Create test project as Owner
2. Create 2-3 test documents (some with `is_open = false`)
3. Create test accounts for Editor and Viewer roles
4. Share project with test accounts

**Test Scenarios:**

**As Owner:**
- [ ] See all documents (open and closed)
- [ ] Can edit all documents
- [ ] Can delete documents
- [ ] Can create new documents
- [ ] See sharing button with member count
- [ ] Can add/remove members
- [ ] Can change member roles
- [ ] See "Owner" badge in UI
- [ ] Permission indicator shows all actions allowed

**As Editor:**
- [ ] See all documents (open and closed)
- [ ] Can edit text content (notes_content) in all documents
- [ ] **Cannot edit drawing content** (drawing tool disabled/hidden)
- [ ] See message: "Drawing tool is only available to Owners"
- [ ] Cannot delete documents (button disabled/hidden)
- [ ] Can create new documents
- [ ] Do not see sharing button
- [ ] See "Editor" badge in UI
- [ ] Permission indicator shows: ✓ Edit Text, ✗ Edit Drawing, ✗ Delete

**As Viewer:**
- [ ] Only see documents where `is_open = true`
- [ ] See document count: "Showing 2 of 3 documents"
- [ ] Cannot edit documents (read-only mode)
- [ ] See "Read-only" banner in document editor
- [ ] Cannot delete documents (button hidden)
- [ ] Cannot create documents (button hidden)
- [ ] See "Viewer" badge in UI
- [ ] Permission indicator shows only view allowed
- [ ] Lock icons visible on closed documents (if any visible)

**Sharing Modal Tests:**
- [ ] Owner can open sharing modal
- [ ] Editor/Viewer cannot see sharing button
- [ ] Member list shows all members with correct roles
- [ ] Current user highlighted in member list
- [ ] Can add new member by email
- [ ] Can change member role (Owner only)
- [ ] Can remove member (Owner only)
- [ ] Cannot remove last owner (validation works)
- [ ] Owner transfer shows confirmation dialog

---

## 10. Security Considerations

1. **RLS is the source of truth**: Client-side checks are for UX only - never trust the client
2. **All operations must go through RLS policies**: Direct database access is blocked
3. **Single source of truth**: `project_members` table is the only source for permissions (no `owner_id` fallback)
4. **Owner transfer protection**: Only current owner can transfer ownership
5. **Last owner protection**: Prevent removing last owner (enforced in RLS and UI)
6. **Document visibility**: Viewers cannot see closed documents (enforced in RLS)
7. **User lookup**: When adding members by email, verify user exists and is authenticated
8. **Role validation**: Ensure only valid roles ('owner', 'editor', 'viewer') are assigned
9. **Project creation**: Always create `project_members` entry when creating new project (if authenticated)

---

## 11. Migration File Structure

Create migration file: `supabase/migrations/[timestamp]_collaboration_phase1.sql`

This migration should include:
1. `project_members` table creation
2. `is_open` columns addition
3. Helper functions
4. RLS policies (drop old, create new)
5. Data migration script:
   ```sql
   -- Migrate existing projects with owner_id to project_members
   INSERT INTO project_members (project_id, user_id, role)
   SELECT id, owner_id, 'owner'
   FROM projects
   WHERE owner_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM project_members pm 
       WHERE pm.project_id = projects.id 
         AND pm.user_id = projects.owner_id
     );
   ```

**Note:** Projects with only `guest_id` (no `owner_id`) will remain guest-only until a user claims them or they're accessed by an authenticated user who should be the owner.

### 7.3 Project Creation Flow

**When creating a new project:**
1. If user is authenticated:
   - Create project
   - Automatically create `project_members` entry with current user as 'owner'
   - Set `guest_id` if needed for backward compatibility
2. If user is not authenticated (guest):
   - Create project with `guest_id` only
   - No `project_members` entry (project remains guest-only)
   - When user later authenticates, they can "claim" the project (add themselves as owner)

**Updated `createProject` function:**
```javascript
export async function createProject(name) {
  const guestId = getGuestId()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Create project
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ 
      id: generateProjectId(), 
      name, 
      guest_id: guestId, 
      type: 'native' 
    })
    .select()
    .single()
  
  if (error) throw error
  
  // If authenticated, create owner entry
  if (user) {
    await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: user.id,
        role: 'owner'
      })
  }
  
  return project
}
```

---

## 12. Future Phases (Out of Scope for Phase 1)

- **Phase 2**: Real-time text collaboration with Y-Sweet/Yjs (see Section 5)
- **Phase 3**: Comments system with BlockNote integration
- **Phase 4**: Per-document role overrides UI
- **Phase 5**: Notification system, activity feed
- **Phase 6**: Guest user support for collaboration
- **Phase 7** (Optional): Enable drawing for Editors - see Section 3.4.3 for migration steps
