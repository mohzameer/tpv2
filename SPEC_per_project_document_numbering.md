# Specification: Per-Project Document Numbering

## Version
0.3.0

## Date
2024-12-17
Updated: 2024-12-18 (aligned with unified document architecture)

## Overview
Implement per-project document numbering so that each project has its own sequential document numbers (1, 2, 3...) instead of global all-time numbering. Document IDs remain unchanged for backward compatibility.

**Note**: This specification assumes the unified document architecture (see `SPEC_unified_document_architecture.md`) is already in place. Documents now have a `document_type` field ('text' or 'drawing'), and both types are shown in a unified document list. Document numbering applies to all document types within each project.

## Goals
1. Add `document_number` field to `documents` table (per-project sequential numbering for all document types)
2. Auto-assign document numbers on document creation (both text and drawing documents)
3. Store document numbers in new localStorage key (separate from existing)
4. Maintain backward compatibility with existing document IDs
5. No breaking changes to URLs or routing
6. Work seamlessly with unified document architecture (text and drawing documents numbered together per project)

## Non-Goals
- Changing document IDs in URLs
- Re-sequencing documents after deletion (gaps are acceptable)
- Migrating existing localStorage data
- Changing foreign key relationships
- Separate numbering for text vs drawing documents (they share the same sequence per project)

## Architecture Context

This specification builds on the **unified document architecture** (see `SPEC_unified_document_architecture.md`), which is already implemented:

- Documents have a `document_type` field ('text' or 'drawing')
- Both document types are shown in a unified sidebar list
- `DocumentPage` conditionally renders `NotesPanel` or `DrawingPanel` based on `document_type`
- No split-screen complexity (WorkspacePanel removed)
- Simplified navigation and state management

**Document numbering applies to all document types within each project**. For example, a project might have:
- Document #1: text document
- Document #2: drawing document  
- Document #3: text document
- etc.

The numbering sequence is shared across document types, maintaining a single sequential order per project.

---

## Database Changes

### 1. Schema Migration

**Files**: 
- `migrations/0.3.0/001_per_project_document_numbering.sql` - Main migration
- `migrations/0.3.0/002_backfill_document_numbers.sql` - Standalone backfill script

#### 1.1 Add `document_number` Column
```sql
-- Add document_number column (nullable initially for migration)
ALTER TABLE documents 
ADD COLUMN document_number INTEGER;

-- Add index for performance (used in trigger)
CREATE INDEX idx_documents_project_number 
ON documents(project_id, document_number);
```

#### 1.2 Backfill Existing Documents

**Note**: The backfill assigns sequential numbers to all documents (both text and drawing types) within each project, based on creation order. Document numbers are shared across document types within a project (e.g., a project might have text document #1, drawing document #2, text document #3, etc.).

**Option A: Run as part of main migration**
The main migration script (`001_per_project_document_numbering.sql`) includes the backfill step.

**Option B: Run separately (Recommended for large databases)**
Use the standalone backfill script (`002_backfill_document_numbers.sql`) which:
- Can be run independently for testing
- Includes verification queries
- Is idempotent (safe to run multiple times)
- Allows you to verify results before proceeding

```sql
-- Assign sequential numbers per project based on creation order
-- Numbers are assigned to all document types (text and drawing) together
WITH numbered_docs AS (
  SELECT 
    id,
    project_id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id 
      ORDER BY created_at ASC, id ASC
    ) as doc_num
  FROM documents
  WHERE document_number IS NULL
)
UPDATE documents d
SET document_number = n.doc_num
FROM numbered_docs n
WHERE d.id = n.id AND d.document_number IS NULL;
```

**See `migrations/0.3.0/README.md` for detailed migration instructions.**

#### 1.3 Add Constraints
```sql
-- Make document_number NOT NULL
ALTER TABLE documents 
ALTER COLUMN document_number SET NOT NULL;

-- Add unique constraint per project
ALTER TABLE documents 
ADD CONSTRAINT unique_project_document_number 
UNIQUE (project_id, document_number);
```

#### 1.4 Create Auto-Increment Function
```sql
-- Function to get next document number for a project
CREATE OR REPLACE FUNCTION get_next_document_number(p_project_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Use advisory lock to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('doc_num_' || p_project_id));
  
  -- Get max document number for this project
  SELECT COALESCE(MAX(document_number), 0) + 1
  INTO next_num
  FROM documents
  WHERE project_id = p_project_id;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;
```

#### 1.5 Create Trigger
```sql
-- Trigger to auto-assign document_number on insert
CREATE OR REPLACE FUNCTION assign_document_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Only assign if not already set (allows manual override if needed)
  IF NEW.document_number IS NULL THEN
    NEW.document_number := get_next_document_number(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER assign_document_number_trigger
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION assign_document_number();
```

---

## Application Code Changes

### 2. localStorage Changes

**File**: `src/lib/lastVisited.js`

#### 2.1 New localStorage Key
- **Old key**: `thinkpost_last_visited` (leave untouched)
- **New key**: `thinkpost_last_visited_v2`

#### 2.2 New Data Structure
```javascript
{
  // Per-project last visited documents (by document_number, not id)
  projects: {
    [projectId]: documentNumber  // e.g., "abc123": 3
  },
  // Global last visited (for backward compatibility)
  lastProjectId: "abc123",
  lastDocumentNumber: 3
}
```

#### 2.3 New Functions
```javascript
// Get last visited document number for a project
export function getLastDocumentNumberForProject(projectId) {
  const stored = localStorage.getItem('thinkpost_last_visited_v2')
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    if (data.projects && data.projects[projectId]) {
      return data.projects[projectId]
    }
    return null
  } catch {
    return null
  }
}

// Set last visited document number for a project
export function setLastVisitedDocumentNumber(projectId, documentNumber) {
  const stored = localStorage.getItem('thinkpost_last_visited_v2')
  let data = {}
  
  if (stored) {
    try {
      data = JSON.parse(stored)
    } catch {
      data = {}
    }
  }
  
  // Store per-project
  if (!data.projects) {
    data.projects = {}
  }
  data.projects[projectId] = documentNumber
  
  // Store global
  data.lastProjectId = projectId
  data.lastDocumentNumber = documentNumber
  
  localStorage.setItem('thinkpost_last_visited_v2', JSON.stringify(data))
}
```

### 3. API Changes

**File**: `src/lib/api.js`

#### 3.1 Update `createDocument` Response
Ensure `document_number` is returned in the response (should be automatic). Works for both text and drawing document types.

**Note**: The `createDocument` function now accepts `documentType` parameter ('text' or 'drawing') as part of the unified architecture. Document numbers are assigned regardless of document type.

#### 3.2 Update `getDocuments` Response
Ensure `document_number` is included in document objects. The unified document list includes both text and drawing documents, all with document numbers.

#### 3.3 Add Helper Function (Optional)
```javascript
// Get document by project_id and document_number
// Works for both text and drawing documents
export async function getDocumentByNumber(projectId, documentNumber) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('document_number', documentNumber)
    .single()
  
  if (error) throw error
  return data
}
```

### 4. Component Changes

#### 4.1 Sidebar Component
**File**: `src/components/Sidebar.jsx`

**Context**: The Sidebar now shows a unified list of all documents (both text and drawing types) with type-specific icons. The unified architecture is already in place.

**Changes**:
- Store document numbers in new localStorage when navigating (works for both text and drawing documents)
- Use document numbers for "last visited" tracking
- Display document numbers alongside or instead of titles (optional, future enhancement)

**Example**:
```javascript
// When navigating to a document (in Sidebar or elsewhere)
const doc = documents.find(d => d.id === docId)
if (doc && doc.document_number) {
  // Works for both text and drawing documents
  setLastVisitedDocumentNumber(project.id, doc.document_number)
}
```

#### 4.2 Navigation Logic
**Files**: 
- `src/components/Sidebar.jsx` (primary navigation)
- `src/pages/HomePage.jsx`
- `src/pages/LoginPage.jsx`
- `src/hooks/useProject.js`

**Context**: The unified architecture has simplified navigation. `DocumentPage` now conditionally renders either `NotesPanel` or `DrawingPanel` based on `document_type`, without split-screen complexity.

**Changes**:
- When restoring last visited, try document number first, fallback to document ID
- Handle cases where document number doesn't exist (graceful degradation)
- Works seamlessly for both text and drawing documents

**Example**:
```javascript
// In Sidebar.jsx or navigation logic
// Try to find by document number first
const lastDocNumber = getLastDocumentNumberForProject(projectId)
if (lastDocNumber) {
  // Find document by number (works for any document_type)
  const doc = documents.find(d => d.document_number === lastDocNumber)
  if (doc) {
    // DocumentPage will automatically render the correct editor based on document_type
    navigate(`/${projectId}/${doc.id}`) // Still use ID in URL
    return
  }
}

// Fallback to old method (document ID)
const lastDocId = getLastDocumentForProject(projectId)
// ... existing logic
```

---

## Migration Strategy

### Phase 1: Database Migration (Production)

**Option A: All-in-One (Recommended for small databases)**
1. Run migration script `001_per_project_document_numbering.sql` (includes backfill)
2. Verify all documents have `document_number` assigned
3. Verify trigger works on new document creation
4. Monitor for any errors

**Option B: Two-Step (Recommended for large databases)**
1. Run migration script `001_per_project_document_numbering.sql` up to backfill step
2. Run standalone backfill script `002_backfill_document_numbers.sql`
3. Verify results using queries in backfill script
4. Continue with remaining steps (NOT NULL constraint, functions, triggers)
5. Verify trigger works on new document creation
6. Monitor for any errors

**See `migrations/0.3.0/README.md` for detailed step-by-step instructions.**

### Phase 2: Code Deployment
1. Deploy code changes
2. New localStorage key will be created automatically on first use
3. Old localStorage key remains untouched
4. Both systems work in parallel

### Phase 3: Monitoring
1. Monitor for any issues with document creation
2. Check localStorage usage (both keys)
3. Verify navigation works correctly

---

## Testing Requirements

### Unit Tests
1. **Document Creation**
   - Create text document in Project A → should get document_number = 1
   - Create drawing document in Project A → should get document_number = 2
   - Create second text document in Project A → should get document_number = 3
   - Create document in Project B → should get document_number = 1 (independent numbering)
   - Verify no race conditions with concurrent inserts
   - Verify document numbers are shared across document types within a project

2. **localStorage**
   - Verify new key is created
   - Verify old key is not modified
   - Verify document numbers are stored correctly

3. **Navigation**
   - Verify last visited works with document numbers
   - Verify fallback to document ID works
   - Verify navigation after document deletion

### Integration Tests
1. **Full Flow**
   - Create project → Create text and drawing documents → Navigate → Verify numbers
   - Switch projects → Verify per-project numbering (independent per project)
   - Delete document (any type) → Verify gaps are acceptable
   - Restore last visited → Verify correct document opens (works for both types)
   - Navigate between text and drawing documents → Verify numbering continuity

2. **Edge Cases**
   - Empty project → Create first document (text or drawing)
   - Project with many documents (100+, mix of types)
   - Concurrent document creation (both types)
   - Document deletion and recreation (any type)
   - Mixed document types in same project → verify numbering continuity

### Manual Testing Checklist
- [ ] Create new text document → verify document_number assigned
- [ ] Create new drawing document → verify document_number assigned (sequential with text docs)
- [ ] Create multiple documents (mix of text and drawing) in same project → verify sequential numbering
- [ ] Create documents in different projects → verify independent numbering per project
- [ ] Navigate between text and drawing documents → verify localStorage updated with document numbers
- [ ] Refresh page → verify last visited restored correctly (works for both document types)
- [ ] Delete document (any type) → verify gaps are acceptable
- [ ] Verify old localStorage key unchanged
- [ ] Verify URLs still use document IDs
- [ ] Verify DocumentPage renders correct editor (NotesPanel or DrawingPanel) based on document_type

---

## Rollback Plan

### If Migration Fails
1. **Database Rollback**:
```sql
-- Remove trigger
DROP TRIGGER IF EXISTS assign_document_number_trigger ON documents;

-- Remove function
DROP FUNCTION IF EXISTS assign_document_number();
DROP FUNCTION IF EXISTS get_next_document_number(TEXT);

-- Remove constraints
ALTER TABLE documents DROP CONSTRAINT IF EXISTS unique_project_document_number;

-- Remove column
ALTER TABLE documents DROP COLUMN IF EXISTS document_number;

-- Remove index
DROP INDEX IF EXISTS idx_documents_project_number;
```

2. **Code Rollback**:
   - Revert code changes
   - Old localStorage key will continue to work
   - No data loss

### If Issues After Deployment
1. Monitor error logs
2. Check document creation failures
3. If critical, rollback code (database changes are non-breaking)

---

## Performance Considerations

### Database
- **Index**: `idx_documents_project_number` ensures fast MAX() queries
- **Advisory Locks**: Prevent race conditions without table-level locks
- **Trigger Overhead**: Minimal (one query per insert)

### Application
- **localStorage**: Two keys (old and new) - minimal impact
- **Navigation**: Slight overhead checking document numbers first, then IDs

### Scalability
- Works well for projects with < 10,000 documents
- For larger projects, consider caching max document_number per project

---

## Security Considerations

1. **Advisory Locks**: Use project-specific locks to minimize contention
2. **Input Validation**: Ensure document_number is positive integer
3. **RLS Policies**: No changes needed (document_number is not sensitive)

---

## Future Enhancements (Out of Scope)

1. Re-sequencing documents after deletion
2. Custom document numbering schemes
3. Document number display in UI
4. Migration tool for old localStorage data
5. Document number in URLs (would require major refactor)

---

## Success Criteria

1. ✅ All existing documents (text and drawing) have `document_number` assigned
2. ✅ New documents (both types) automatically get sequential numbers per project
3. ✅ Document numbers are shared across document types within each project
4. ✅ No breaking changes to existing functionality
5. ✅ Old localStorage key remains untouched
6. ✅ New localStorage key stores document numbers correctly
7. ✅ Navigation works with both old and new systems (for both document types)
8. ✅ DocumentPage correctly renders NotesPanel or DrawingPanel based on document_type
9. ✅ No performance degradation
10. ✅ All tests pass

---

## Implementation Notes

### Advisory Lock Strategy
- Uses `pg_advisory_xact_lock` with project-specific hash
- Locks are automatically released on transaction commit
- Prevents race conditions without blocking other projects

### Document Number Gaps
- Gaps are acceptable and expected (e.g., 1, 2, 4, 5 after deletion)
- No re-sequencing needed
- Simplifies implementation and avoids data integrity issues

### Backward Compatibility
- Document IDs remain primary identifiers
- URLs continue to use document IDs
- Old localStorage key continues to work
- Graceful fallback if document number lookup fails
- Works with unified document architecture (document_type field)
- Document numbering applies to all document types (text and drawing) within each project

### Unified Architecture Integration
- Document numbering works seamlessly with the unified document list
- Both text and drawing documents share the same numbering sequence per project
- DocumentPage automatically renders the correct editor based on document_type
- No changes needed to the simplified DocumentPage structure (no WorkspacePanel)

---

## Appendix: Migration Script Template

See `migrations/0.3.0/001_per_project_document_numbering.sql` for complete migration script.

