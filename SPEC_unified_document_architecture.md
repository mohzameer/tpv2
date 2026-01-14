# Spec: Unified Document Architecture

## Overview

This spec defines a major architectural refactoring to remove the split-screen system and unify documents and drawings into a single document list. The architecture will be redesigned from a navigation-first perspective, where each document is displayed full-screen with the appropriate editor based on its type.

## Goals

1. **Remove split-screen complexity**: Eliminate the notes/both/drawing mode system and associated UI controls
2. **Unified document list**: Show both text documents and drawings in a single sidebar list
3. **Type-based rendering**: Automatically load the correct editor (text editor or canvas) based on document type
4. **Simplified navigation**: One document at a time, full-screen view
5. **Clean architecture**: Rethink from navigation-first rather than adapting existing split-screen code

## Current Architecture Issues

The current architecture is optimized for split-screen functionality, which creates unnecessary complexity:

- **WorkspacePanel**: Manages split panels with resizable handles, visibility toggling, and size tracking
- **Mode state management**: Complex state for 'notes', 'drawing', 'both' modes across multiple components
- **Layout persistence**: Saving and loading panel sizes, ratios, and modes per document
- **Header mode buttons**: SegmentedControl for switching between modes
- **DocumentPage complexity**: Handles mode changes, ratio changes, panel size changes, and layout persistence
- **Component lifecycle**: Both panels always mounted but hidden, causing performance overhead

## New Architecture

### 1. Document Type System

#### Database Schema Changes

Add a `document_type` field to the `documents` table:

```sql
ALTER TABLE documents ADD COLUMN document_type TEXT DEFAULT 'text' CHECK (document_type IN ('text', 'drawing'));
```

**Migration Strategy:**
- Existing documents default to `'text'`
- Drawings will be migrated separately with names like "drawing-1", "drawing-2", etc.
- During migration, set `document_type = 'drawing'` for documents with names matching pattern `drawing-*`

#### Type Detection

Document type can be determined by:
1. **Primary**: `document_type` field in database
2. **Fallback**: Name pattern matching (`drawing-*` prefix) for backward compatibility during migration

### 2. Unified Document List

#### Sidebar Changes

**Current behavior:**
- Lists only text documents
- Shows document title, last updated time
- Click to navigate to document

**New behavior:**
- Lists ALL documents (both text and drawings)
- Visual distinction for document types:
  - Text documents: File icon (existing)
  - Drawings: Drawing/Canvas icon (new)
- Same interaction model: click to navigate, double-click to rename, delete button
- Sort by `updated_at` (most recent first)

**Implementation:**
```jsx
// Sidebar.jsx changes
- Import drawing icon (e.g., IconBrush or IconPencil)
- Check document.document_type or name pattern
- Render appropriate icon based on type
- No other changes needed - navigation already works
```

### 3. Document Page Simplification

#### Current Structure
```
DocumentPage
  └── WorkspacePanel (split-screen manager)
      ├── NotesPanel (conditionally visible)
      └── DrawingPanel (conditionally visible)
```

#### New Structure
```
DocumentPage
  └── [Conditional Render]
      ├── NotesPanel (if document_type === 'text')
      └── DrawingPanel (if document_type === 'drawing')
```

**Key Changes:**
- Remove `WorkspacePanel` component entirely
- Remove all mode state management (`mode`, `setMode`)
- Remove layout ratio and panel size state
- Remove mode change handlers
- Simple conditional rendering based on document type
- Full-screen rendering (100% width/height)

**Implementation:**
```jsx
// DocumentPage.jsx simplified
export default function DocumentPage() {
  const { docId } = useParams()
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadDocument()
  }, [docId])
  
  async function loadDocument() {
    const doc = await getDocument(docId)
    setDocument(doc)
    setLoading(false)
  }
  
  if (loading) return <Loader />
  
  const isDrawing = document.document_type === 'drawing' || 
                   document.title?.startsWith('drawing-')
  
  return isDrawing 
    ? <DrawingPanel docId={docId} />
    : <NotesPanel docId={docId} />
}
```

### 4. Header Simplification

#### Remove Mode Controls

**Current:**
- SegmentedControl with Notes/Both/Drawing buttons
- Mode state passed to DocumentPage via Outlet context
- Mode change event dispatching

**New:**
- Remove SegmentedControl entirely
- Remove mode state from MainLayout
- Remove Outlet context passing
- Header becomes simpler: logo, project name, sync status, theme toggle, user menu

**Implementation:**
```jsx
// Header.jsx changes
- Remove mode and onModeChange props
- Remove SegmentedControl component
- Remove mode-related event listeners
- Keep everything else (project name, sync, theme, user menu)
```

### 5. Component Cleanup

#### WorkspacePanel
- **DELETE**: This component is no longer needed
- All split-screen logic removed

#### DocumentPage
- **SIMPLIFY**: Remove all mode/layout state and handlers
- **SIMPLIFY**: Remove WorkspacePanel usage
- **ADD**: Document type detection logic
- **ADD**: Simple conditional rendering

#### MainLayout
- **SIMPLIFY**: Remove mode state
- **SIMPLIFY**: Remove Outlet context passing
- **SIMPLIFY**: Header no longer needs mode props

#### NotesPanel
- **MINIMAL CHANGES**: Already works standalone
- Remove any mode-change event listeners (if any)
- Remove visibility checks (no longer needed)

#### DrawingPanel
- **MINIMAL CHANGES**: Already works standalone
- Remove any mode-change event listeners (if any)
- Remove visibility checks (no longer needed)

### 6. Database Schema Cleanup

#### Remove Unused Fields

After migration, we can optionally remove fields that are no longer needed:

```sql
-- These fields can be removed from document_contents:
-- layout_mode (no longer needed - always full screen)
-- layout_ratio (no longer needed - no split screen)
-- notes_panel_size (no longer needed - no split screen)
-- drawing_panel_size (no longer needed - no split screen)
```

**Note**: Keep these fields during migration period for rollback safety, remove in a later migration.

#### Keep Essential Fields

- `notes_content`: Still needed for text documents
- `drawing_content`: Still needed for drawing documents
- `drawing_files`: Still needed for drawing documents (image files)
- `text_mode`: Still needed for text documents (text vs markdown)

### 7. API Changes

#### Document Creation

**Current:**
```js
createDocument(projectId, title)
```

**New:**
```js
createDocument(projectId, title, documentType = 'text')
// documentType: 'text' | 'drawing'
```

#### Document Queries

No changes needed - `getDocuments()` already returns all documents. The `document_type` field will be included in the response.

### 8. Migration Plan

#### Phase 1: Database Migration
1. Add `document_type` column to `documents` table
2. Set default to 'text' for existing documents
3. Create migration script to identify and mark drawings (by name pattern or other criteria)

#### Phase 2: Code Changes
1. Update Sidebar to show document type icons
2. Simplify DocumentPage (remove WorkspacePanel, mode state)
3. Simplify Header (remove mode controls)
4. Simplify MainLayout (remove mode state)
5. Update API to support document_type in createDocument

#### Phase 3: Testing
1. Test text document creation and editing
2. Test drawing document creation and editing
3. Test navigation between different document types
4. Test document list display
5. Verify no regressions in existing functionality

#### Phase 4: Cleanup (Optional, Later)
1. Remove unused database fields (layout_mode, layout_ratio, etc.)
2. Remove any remaining split-screen code references
3. Update documentation

## Implementation Details

### Document Type Detection Helper

```js
// lib/documentType.js
export function getDocumentType(document) {
  // Primary: check document_type field
  if (document.document_type) {
    return document.document_type
  }
  
  // Fallback: check name pattern
  if (document.title?.toLowerCase().startsWith('drawing-')) {
    return 'drawing'
  }
  
  // Default
  return 'text'
}

export function isDrawing(document) {
  return getDocumentType(document) === 'drawing'
}
```

### Updated Sidebar Icon Logic

```jsx
// Sidebar.jsx
import { IconFile, IconBrush } from '@tabler/icons-react'
import { isDrawing } from '../lib/documentType'

// In render:
<Group gap="xs" wrap="nowrap">
  {isDrawing(doc) ? (
    <IconBrush size={16} color="var(--mantine-color-blue-6)" />
  ) : (
    <IconFile size={16} color="var(--mantine-color-gray-6)" />
  )}
  {/* ... rest of document item ... */}
</Group>
```

### Simplified DocumentPage

```jsx
// DocumentPage.jsx
import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getDocument } from '../lib/api'
import { getDocumentType } from '../lib/documentType'
import NotesPanel from '../components/NotesPanel'
import DrawingPanel from '../components/DrawingPanel'
import { Loader, Center } from '@mantine/core'

export default function DocumentPage() {
  const { projectId, docId } = useParams()
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    if (!docId) return
    loadDocument()
  }, [docId])
  
  async function loadDocument() {
    try {
      // Fetch document metadata
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('id', docId)
        .single()
      
      setDocument(data)
    } catch (err) {
      console.error('Failed to load document:', err)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }
  
  if (!document) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Text>Document not found</Text>
      </Center>
    )
  }
  
  const documentType = getDocumentType(document)
  
  return (
    <div style={{ height: '100%', width: '100%' }}>
      {documentType === 'drawing' ? (
        <DrawingPanel docId={docId} />
      ) : (
        <NotesPanel docId={docId} />
      )}
    </div>
  )
}
```

## Benefits

1. **Simplified Codebase**: Remove ~200+ lines of split-screen management code
2. **Better Performance**: Only one panel mounted at a time, no hidden component overhead
3. **Clearer UX**: One document, one view - no mode confusion
4. **Easier Maintenance**: Less state to manage, fewer edge cases
5. **Scalability**: Easy to add new document types in the future (e.g., 'spreadsheet', 'presentation')
6. **Navigation-First**: Architecture matches user mental model (navigate to document → see document)

## Edge Cases & Considerations

### Document Type Migration
- During migration period, support both `document_type` field and name pattern matching
- Ensure backward compatibility for documents without `document_type` set

### Existing Layout Data
- Existing `layout_mode`, `layout_ratio`, etc. can be ignored
- No need to migrate this data - it's no longer used
- Can be cleaned up in a later migration

### Drawing Migration
- Drawings will be migrated separately with "drawing-x" naming
- Ensure migration script sets `document_type = 'drawing'` correctly
- Verify all drawing content (elements, files, viewport) is preserved

### URL Structure
- No changes needed: `/:projectId/:docId` still works
- Document type is determined from database, not URL

### Last Visited Tracking
- No changes needed - still tracks by docId
- Works for both text and drawing documents

## Testing Checklist

- [ ] Create new text document → opens in NotesPanel
- [ ] Create new drawing document → opens in DrawingPanel
- [ ] Navigate between text documents → loads correctly
- [ ] Navigate between drawing documents → loads correctly
- [ ] Navigate from text to drawing → switches editor correctly
- [ ] Navigate from drawing to text → switches editor correctly
- [ ] Sidebar shows correct icons for each type
- [ ] Document list includes both types
- [ ] Rename works for both types
- [ ] Delete works for both types
- [ ] Last visited tracking works for both types
- [ ] No console errors or warnings
- [ ] Performance: no unnecessary re-renders
- [ ] Backward compatibility: old documents without document_type still work

## Rollback Plan

If issues arise, rollback steps:
1. Revert code changes (git)
2. Database changes are additive (new column with defaults) - safe to keep
3. Can temporarily re-enable WorkspacePanel if needed

## Future Enhancements

Once this architecture is in place, future enhancements become easier:
- Add new document types (spreadsheets, presentations, etc.)
- Document templates
- Document type-specific features
- Better document organization (folders, tags, etc.)
