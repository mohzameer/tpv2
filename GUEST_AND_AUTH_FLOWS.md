# Guest and Authenticated User Flows

This document explains how guest users and authenticated users interact with the collaboration system.

## Overview

The system supports two modes:
1. **Guest Mode**: Anonymous users using `guest_id` (stored in localStorage)
2. **Authenticated Mode**: Signed-in users with roles (Owner, Editor, Viewer)

## User Flows

### 1. New Guest User (First Load)

**What happens:**
1. User loads app → No authentication
2. `getGuestId()` generates/retrieves `guest_id` from localStorage
3. User creates project → `createProject()`:
   - Creates project with `guest_id` set
   - **No** `project_members` entry (project is guest-only)
4. User can:
   - Create/edit documents
   - Edit text and drawings
   - Access via `guest_id` filtering (client-side)
   - **Cannot** share projects or use collaboration features

**RLS Behavior:**
- Projects: Accessible via `auth.uid() IS NULL` OR `is_guest_only_project()` check
- Documents: Accessible if project has no `project_members` entries
- Document Contents: Accessible if project has no `project_members` entries

### 2. New Authenticated User (Signs Up)

**What happens:**
1. User signs up → `auth.users` entry created
2. `sync_user_profile` trigger automatically creates `user_profiles` entry
3. User creates project → `createProject()`:
   - Creates project with `guest_id` (for backward compatibility)
   - **Automatically** creates `project_members` entry with user as 'owner'
4. User can:
   - Full Owner permissions (edit, delete, share)
   - Add collaborators via SharingModal
   - Access via `project_members` (RLS checks)

**RLS Behavior:**
- Projects: Accessible via `user_has_project_access()` check
- Documents: Accessible based on role in `project_members`
- Document Contents: Accessible based on role (Editor/Owner can edit)

### 3. Guest User Authenticates (Upgrade Path)

**What happens:**
1. Guest user has projects with only `guest_id` (no `project_members`)
2. User signs up/logs in
3. Projects remain guest-only until claimed
4. User can:
   - Continue using projects as before (guest access still works)
   - **Optionally** claim projects using `claim_my_projects.sql` script
   - After claiming: Projects become authenticated, can be shared

**Claiming Projects:**
- Run SQL script to add user as 'owner' to all guest-only projects
- Or use UI (if implemented) to claim individual projects
- Once claimed, projects support collaboration features

### 4. Existing Authenticated User (Returning)

**What happens:**
1. User logs in → `auth.users` and `user_profiles` exist
2. `getUserRole()` fetches role from `project_members`
3. User sees projects they're a member of (via RLS)
4. Permissions enforced based on role:
   - **Owner**: Full control
   - **Editor**: Can edit text, create docs, cannot edit drawings
   - **Viewer**: Read-only

## Key Components

### Project Creation (`createProject`)

```javascript
// In src/lib/api.js
export async function createProject(name) {
  const guestId = getGuestId()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Create project
  const project = await supabase.from('projects').insert({
    id: generateProjectId(),
    name,
    guest_id: guestId,  // Always set for backward compatibility
    type: 'native'
  })
  
  // If authenticated, create owner entry
  if (user) {
    await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: user.id,
      role: 'owner'
    })
  }
  
  return project
}
```

### Role Loading (`loadCollaborationData`)

```javascript
// In src/hooks/useProject.js
async function loadCollaborationData(projectId) {
  const [role, projectMembers] = await Promise.all([
    getUserRole(projectId).catch(() => null),  // Returns null for guests
    getProjectMembers(projectId).catch(() => [])  // Returns [] for guests
  ])
  
  setUserRole(role)  // null for guests, 'owner'/'editor'/'viewer' for authenticated
  setMembers(projectMembers || [])
}
```

### Permission Checks

```javascript
// In src/lib/permissions.js
// For guests (userRole === null):
canEditText(null)      // false
canEditDrawing(null)    // false
canDeleteDocument(null) // false

// But UI defaults to editable when userRole is undefined/null during loading
// This prevents banner flashing
```

## RLS Policy Strategy

### Guest Access Pattern

All RLS policies follow this pattern:

```sql
USING (
  -- Authenticated users: check project_members
  (auth.uid() IS NOT NULL AND [role-based check])
  -- Guest users: allow on guest-only projects
  OR (auth.uid() IS NULL AND is_guest_only_project(project_id))
)
```

### Helper Function

```sql
CREATE OR REPLACE FUNCTION is_guest_only_project(project_id_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_id = project_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This function checks if a project has no `project_members` entries, indicating it's guest-only.

## Important Notes

1. **Guest projects cannot be shared**: No `project_members` entries means no collaboration
2. **Client-side filtering**: `getProjects()` filters by `guest_id` on client side
3. **RLS provides security**: Even if client filtering fails, RLS blocks unauthorized access
4. **Upgrade path**: Guests can claim projects after authenticating
5. **Backward compatibility**: All projects have `guest_id` for legacy support

## Migration Considerations

- Existing guest projects (no `owner_id`, no `project_members`) continue to work
- New authenticated users automatically get `project_members` entries
- Old projects with `owner_id` were migrated to `project_members` in initial migration
- Users can claim guest projects using provided SQL scripts
