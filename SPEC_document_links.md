# Specification: Document Links System

## Overview
Implement a system to save and load document/drawing links within documents. When users click the floating link button, they can select a document or drawing from the current project to create a link at that position. Links are saved per document and loaded when the document is opened.

## Requirements

### 1. Data Storage

#### Database Schema
Store links in the `documents` table (merged with document_contents). Add a new JSONB field:

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_links JSONB DEFAULT '[]';
```

#### Link Data Structure
Each link is stored as a JSON object in the `document_links` array:

```typescript
interface DocumentLink {
  id: string;              // Unique ID for this link (e.g., 'link-123')
  targetDocumentId: number; // ID of the linked document
  targetDocumentNumber?: number; // document_number for navigation
  type: 'document' | 'drawing'; // Type of linked document
  title: string;           // Title of linked document (for display)
  position: {
    x: number;             // X position relative to container
    y: number;             // Y position relative to container
    adjustedY?: number;     // Vertical adjustment if repositioned
  };
  createdAt: string;       // ISO timestamp
}
```

#### Storage Location
- Store `document_links` as a JSONB array in the `documents` table
- Links are per-document (each document has its own array of links)
- Links reference other documents in the same project

### 2. Link Creation Flow

#### User Interaction
1. User moves cursor over white background area
2. Floating link button appears and follows cursor
3. User clicks floating link button
4. Modal opens showing documents from current project
5. User selects a document or drawing
6. Link button is created at the clicked position
7. Link is saved to database

#### Modal for Document Selection

**Reuse ProjectsModal Component:**
- Create a new variant/mode of ProjectsModal for link selection
- When opened in "link selection" mode:
  - Automatically show documents from current project (skip project selection)
  - Show only documents (filter out current document to prevent self-linking)
  - Display document type icons (IconFile for documents, IconBrush for drawings)
  - Show document titles and last updated time
  - Clicking a document closes modal and creates the link

**Modal Props:**
```typescript
interface DocumentLinkModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (document: Document) => void;
  currentProjectId: string;
  currentDocumentId: number; // To filter out current document
  mode: 'link-selection'; // New mode for link selection
}
```

**Modal Behavior:**
- Auto-load documents from current project
- Filter out current document from list
- Show loading state while fetching documents
- Display empty state if no other documents exist
- Close on document selection or cancel

### 3. Link Persistence

#### Saving Links
- Save links immediately when created (no debounce needed)
- Update `document_links` field in documents table
- Include all link metadata (position, target document, type, etc.)

#### Loading Links
- Load links when document is opened
- Fetch `document_links` from document data
- Restore link buttons at their saved positions
- Handle missing or invalid links gracefully

#### Link Updates
- When a linked document is deleted, mark link as invalid (or remove it)
- When a linked document title changes, update link title on next load
- Links persist across document saves/loads

### 4. API Functions

#### New API Functions in `src/lib/api.js`

```javascript
// Update document with links
export async function updateDocumentLinks(documentId, links) {
  const { data, error } = await supabase
    .from('documents')
    .update({ document_links: links })
    .eq('id', documentId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Get document with links (enhance existing getDocumentContent)
// Links are already included in document data, but ensure they're returned
```

#### Integration with Existing Functions
- `getDocumentContent()` should already return document data including `document_links`
- `updateDocumentContent()` can be extended or create separate function for links
- Links are part of document metadata, not content

### 5. Component Integration

#### NotesPanel Component
- Load links when document loads
- Pass links to `DocumentLinkButtons` component
- Handle link creation callback
- Save links when they change

#### DocumentLinkButtons Component
- Receive links as props
- Display link buttons at saved positions
- Handle link button click → show context menu
- Menu options: "Go to document" and "Delete link"
- Handle link deletion via menu
- Handle navigation via menu
- Call parent callback when links change

#### FloatingLinkButton Component
- On click, open document selection modal
- Pass selected document to parent for link creation

#### ProjectsModal Component
- Add new `mode` prop: `'projects' | 'link-selection'`
- In link-selection mode:
  - Skip project selection view
  - Auto-select current project
  - Filter out current document
  - Show documents in selection mode (different styling)
  - Call `onSelect` callback instead of navigating

### 6. Link Button Behavior

#### Display
- Show appropriate icon based on linked document type
- Display tooltip with document title
- Position at saved coordinates (with adjustments if needed)

#### Interaction
- **Click on link button** → Show context menu with options:
  - "Go to document" - Navigate to linked document
  - "Delete link" - Remove the link (with confirmation)
- **Menu Implementation**:
  - Use Mantine Menu component
  - Position menu near the clicked button
  - Show document title in menu header
  - Menu items with icons (IconFile/IconBrush for go, IconTrash for delete)
  - Close menu on selection or click outside

#### Navigation
- When "Go to document" is selected, navigate to linked document
- Use document_number for navigation: `/${projectId}/${documentNumber}`
- Update project context if needed
- Store document number in last visited for project

#### Deletion
- When "Delete link" is selected:
  - Show confirmation dialog (optional, or direct delete)
  - Remove link from local state
  - Update database (remove from document_links array)
  - Remove link button from UI
- Deletion is immediate (no undo for now, future enhancement)

### 7. Edge Cases

#### Missing Documents
- If linked document is deleted, show link as invalid (grayed out)
- Option to remove invalid links
- Handle gracefully without breaking UI

#### Document Type Changes
- If document type changes (text ↔ drawing), update link icon
- Preserve link position and metadata

#### Project Changes
- Links only work within the same project
- If project changes, links to other projects become invalid
- Validate links belong to current project

#### Position Validation
- Validate link positions are within container bounds
- Adjust positions if container size changes
- Handle scroll position changes

### 8. Implementation Steps

1. **Database Migration**
   - Add `document_links` JSONB column to documents table
   - Create migration file

2. **API Functions**
   - Add `updateDocumentLinks()` function
   - Ensure `getDocumentContent()` returns links
   - Test API functions

3. **ProjectsModal Enhancement**
   - Add `mode` prop for link-selection
   - Implement link-selection mode UI
   - Filter current document
   - Handle document selection callback

4. **NotesPanel Integration**
   - Load links on document open
   - Save links when created/deleted
   - Manage link state
   - Open modal on floating button click

5. **DocumentLinkButtons Enhancement**
   - Add context menu on link button click
   - Implement menu with "Go to document" and "Delete link" options
   - Handle link navigation via menu
   - Handle link deletion via menu
   - Display link metadata in menu
   - Handle invalid links (disable navigation, show warning)

6. **Testing**
   - Test link creation
   - Test link persistence
   - Test link loading
   - Test navigation
   - Test edge cases

### 9. Data Flow

```
User clicks floating link button
  ↓
Open ProjectsModal in link-selection mode
  ↓
User selects document
  ↓
Create link object with position and target
  ↓
Add link to local state
  ↓
Save links to database (updateDocumentLinks)
  ↓
Display link button at position
```

```
Document opens
  ↓
Load document data (includes document_links)
  ↓
Parse document_links array
  ↓
Create link buttons at saved positions
  ↓
Display in DocumentLinkButtons component
```

### 10. Future Enhancements

1. **Link Management**
   - Edit link positions
   - Change linked document
   - Bulk operations

2. **Visual Indicators**
   - Show link count
   - Highlight linked documents
   - Show link relationships

3. **Link Types**
   - Different link styles for different purposes
   - Link categories/tags

4. **Link Validation**
   - Check if linked documents still exist
   - Validate link integrity
   - Auto-cleanup invalid links

## Technical Notes

- Links are stored as JSONB for flexibility
- No separate links table needed (simpler schema)
- Links are part of document metadata
- Position coordinates are relative to container
- Links are project-scoped (only link within same project)
- Context menu uses Mantine Menu component for consistency
- Menu positioning should account for button location (avoid off-screen)

## Menu Implementation Details

### Menu Component Structure
```jsx
<Menu>
  <Menu.Target>
    <button>Link Button</button>
  </Menu.Target>
  <Menu.Dropdown>
    <Menu.Label>Document Title</Menu.Label>
    <Menu.Item 
      leftSection={<IconFile size={14} />}
      onClick={handleNavigate}
    >
      Go to document
    </Menu.Item>
    <Menu.Divider />
    <Menu.Item 
      leftSection={<IconTrash size={14} />}
      color="red"
      onClick={handleDelete}
    >
      Delete link
    </Menu.Item>
  </Menu.Dropdown>
</Menu>
```

### Menu Behavior
- Open on button click
- Close on item selection
- Close on click outside
- Position menu to avoid going off-screen
- Show document type icon in menu label
- Disable "Go to document" if link is invalid
