# Production Migration Guide

## Overview
After applying the collaboration Phase 1 migration, existing projects need to be migrated to the new `project_members` system.

## Migration Scripts

### 1. `fix_existing_projects_production.sql` (Admin/One-time)
**Purpose:** Migrate all existing projects at once
**Who runs it:** Database admin or developer
**When:** Once, after deploying the collaboration feature
**What it does:**
- Migrates projects with `owner_id` to `project_members`
- Sets `is_open = true` for all projects/documents
- Provides verification queries

**How to run:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the entire script
3. Run it
4. Check the verification queries to confirm migration

### 2. `claim_my_projects.sql` (User Self-Service)
**Purpose:** Allow users to claim their own guest projects
**Who runs it:** Individual users
**When:** As needed, when users can't access their projects
**What it does:**
- Shows projects that might belong to the user
- Allows user to claim unclaimed projects as owner
- Verifies claimed projects

**How to run:**
1. User must be authenticated in Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the script
4. Review Step 1 results
5. Run Step 2 to claim projects
6. Verify with Step 3

## Migration Strategy

### Option A: Admin Migration (Recommended for Production)
1. Run `fix_existing_projects_production.sql` once
2. This handles all projects with `owner_id`
3. Guest-only projects remain accessible via `guest_id` (backward compatible)
4. Users can optionally claim their guest projects using `claim_my_projects.sql`

### Option B: User Self-Service
1. Deploy the collaboration feature
2. Users who can't access projects run `claim_my_projects.sql`
3. They claim ownership of their projects

### Option C: Hybrid
1. Admin runs production script for projects with `owner_id`
2. Users run claim script for their guest projects
3. Best of both worlds

## Important Notes

1. **Idempotent:** Both scripts can be run multiple times safely
2. **Guest Projects:** Projects with only `guest_id` (no `owner_id`) will continue to work for guests via the RLS policy that allows `auth.uid() IS NULL`
3. **New Projects:** All new projects automatically add the creator as owner (handled in `createProject` function)
4. **No Data Loss:** This migration doesn't delete or modify existing data, only adds `project_members` entries

## Verification

After running migrations, verify:

```sql
-- Check migration status
SELECT 
  COUNT(*) as total_projects,
  COUNT(DISTINCT pm.project_id) as projects_with_members,
  COUNT(*) - COUNT(DISTINCT pm.project_id) as guest_only_projects
FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id;
```

## Troubleshooting

**Issue:** User can't access their projects
**Solution:** Run `claim_my_projects.sql` as that user

**Issue:** Many projects without members
**Solution:** This is normal for guest-only projects. They'll continue working for guests.

**Issue:** Need to assign default owner to all projects
**Solution:** Uncomment and modify Step 5 in `fix_existing_projects_production.sql`
