# Specification: Editor Scroll State Persistence

## Version
0.1.0

## Date
2024-12-17

## Overview
Extend the NotesPanel editor state persistence to include scroll position information so that users' editor view is preserved when they return to a document. Currently, only the content (blocks/markdown) and text mode preference are saved; this spec adds support for tracking and restoring scroll position for both text mode (BlockNote editor) and markdown mode (Textarea).

## Goals
1. Store scroll position per document in `document_contents` table
2. Restore scroll position when loading documents
3. Preserve user's scroll context across sessions
4. Support both text mode (BlockNote) and markdown mode (Textarea)
5. Maintain backward compatibility with existing documents
6. Handle scroll state updates efficiently (debounced saves)

## Non-Goals
- Storing per-user scroll preferences (scroll is document-level, not user-level)
- Storing cursor position or selection state
- Storing viewport state for DrawingPanel (handled separately in SPEC_excalidraw_viewport_state.md)
- Migrating existing documents to include scroll state

---

## Current State Analysis

### Current Implementation
**File**: `src/components/NotesPanel.jsx`

Currently, the NotesPanel saves:
- ✅ `notes_content`: BlockNote blocks (JSONB array)
- ✅ `text_mode`: 'text' or 'markdown' preference
- ❌ Scroll position is lost when switching documents

**Scrollable Containers**:
1. **Text Mode**: BlockNote editor rendered inside a `<Box>` with `overflow: 'auto'` (line 375)
2. **Markdown Mode**: `<Textarea>` component with `overflow: 'auto'` (line 379)

Both containers are wrapped in a parent `<Box>` with `flex: 1, overflow: 'auto'` that provides the scrollable viewport.

### Scroll Position Tracking Approach

**Text Mode (BlockNote)**:
- BlockNote editor is rendered via `<BlockNoteView>` component
- The scrollable container is the parent `<Box>` element
- Need to track scroll position of the container element, not the editor itself
- BlockNote doesn't provide scroll position via API, so we track the DOM element's scrollTop

**Markdown Mode (Textarea)**:
- Mantine `<Textarea>` component with custom styling
- The scrollable container is the `<Textarea>` element itself
- Can track `scrollTop` property of the textarea element

**Key Insight**: Both modes use standard DOM scrolling, so we can use `scrollTop` property of the scrollable container element.

---

## Database Schema

### Current Schema
**Table**: `document_contents`
**Columns**: 
- `notes_content` (JSONB): BlockNote blocks
- `text_mode` (TEXT): 'text' or 'markdown'
- `drawing_content` (JSONB): Excalidraw data
- `layout_mode` (TEXT): Layout preference
- `layout_ratio` (REAL): Split ratio

### Updated Structure
**Add new column**: `editor_scroll_position` (REAL)

**New Column**:
```sql
ALTER TABLE document_contents 
ADD COLUMN editor_scroll_position REAL DEFAULT 0;
```

**Rationale**:
- `REAL` type is sufficient for scroll position (pixel values, typically integers but can be fractional)
- Default `0` means start at top for documents without saved scroll position
- Single value stores vertical scroll position (horizontal scrolling is rare in text editors)

**Alternative Considered**: Storing in JSONB
- Could add to a `editor_state` JSONB column
- Simpler to add a dedicated column for now
- Can migrate to JSONB later if more editor state is needed

---

## Application Code Changes

### 1. NotesPanel Component

**File**: `src/components/NotesPanel.jsx`

#### 1.1 Add Scroll Position State and Refs

**Add state and refs to track scroll position**:
```javascript
const [scrollPosition, setScrollPosition] = useState(0)
const scrollContainerRef = useRef(null)
const textareaRef = useRef(null)
const scrollSaveTimeout = useRef(null)
```

#### 1.2 Add Scroll Event Handlers

**Add scroll event listeners for both modes**:

```javascript
// Handler for text mode (BlockNote container)
function handleTextModeScroll(e) {
  const scrollTop = e.target.scrollTop
  setScrollPosition(scrollTop)
  
  // Debounce save to database
  if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current)
  scrollSaveTimeout.current = setTimeout(() => {
    saveScrollPosition(scrollTop)
  }, 1000)
}

// Handler for markdown mode (Textarea)
function handleMarkdownScroll(e) {
  const scrollTop = e.target.scrollTop
  setScrollPosition(scrollTop)
  
  // Debounce save to database
  if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current)
  scrollSaveTimeout.current = setTimeout(() => {
    saveScrollPosition(scrollTop)
  }, 1000)
}
```

#### 1.3 Add Save Scroll Position Function

```javascript
async function saveScrollPosition(scrollTop) {
  if (!docId) return
  
  try {
    await updateDocumentContent(docId, { editor_scroll_position: scrollTop })
  } catch (err) {
    console.error('Failed to save scroll position:', err)
  }
}
```

#### 1.4 Update `loadContent` Function

**Current** (line 260-295):
```javascript
async function loadContent() {
  try {
    const content = await getDocumentContent(docId)
    // ... load blocks and text_mode
  } catch (err) {
    console.error('Failed to load notes:', err)
  } finally {
    setLoading(false)
  }
}
```

**Updated** (load scroll position and restore after content loads):
```javascript
async function loadContent() {
  try {
    const content = await getDocumentContent(docId)
    
    // Load content (existing logic)
    if (content?.notes_content && Array.isArray(content.notes_content) && content.notes_content.length > 0) {
      editor.replaceBlocks(editor.document, content.notes_content)
      lastSavedContent.current = JSON.stringify(content.notes_content)
    } else {
      editor.replaceBlocks(editor.document, defaultBlocks)
      lastSavedContent.current = JSON.stringify(defaultBlocks)
    }
    
    // Load text mode
    if (content?.text_mode) {
      setTextMode(content.text_mode)
      lastSavedTextMode.current = content.text_mode
    } else {
      setTextMode('text')
      lastSavedTextMode.current = 'text'
    }
    
    // Load markdown text
    const md = await blocksToMarkdownPreservingEmpty(editor, editor.document)
    setMarkdownText(md)
    
    // Load scroll position
    const savedScrollPosition = content?.editor_scroll_position ?? 0
    setScrollPosition(savedScrollPosition)
    
    // Restore scroll position after a short delay to ensure DOM is ready
    setTimeout(() => {
      restoreScrollPosition(savedScrollPosition)
    }, 100)
    
    // Focus on second block (existing logic)
    setTimeout(() => {
      const blocks = editor.document
      if (blocks.length > 1) {
        editor.setTextCursorPosition(blocks[1].id, 'start')
      }
    }, 100)
  } catch (err) {
    console.error('Failed to load notes:', err)
  } finally {
    setLoading(false)
  }
}
```

#### 1.5 Add Restore Scroll Position Function

```javascript
function restoreScrollPosition(scrollTop) {
  if (textMode === 'text') {
    // Restore scroll for text mode (BlockNote container)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollTop
    }
  } else {
    // Restore scroll for markdown mode (Textarea)
    if (textareaRef.current) {
      textareaRef.current.scrollTop = scrollTop
    }
  }
}
```

#### 1.6 Update Component JSX

**Current** (line 362-400):
```javascript
return (
  <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
    <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
      <SegmentedControl ... />
    </Box>
    <Box style={{ flex: 1, overflow: 'auto', paddingTop: 40, paddingBottom: 400 }}>
      {textMode === 'text' ? (
        <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
      ) : (
        <Textarea
          value={markdownText}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          ...
        />
      )}
    </Box>
  </Box>
)
```

**Updated** (add refs and scroll handlers):
```javascript
return (
  <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
    <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
      <SegmentedControl ... />
    </Box>
    <Box 
      ref={scrollContainerRef}
      style={{ flex: 1, overflow: 'auto', paddingTop: 40, paddingBottom: 400 }}
      onScroll={textMode === 'text' ? handleTextModeScroll : undefined}
    >
      {textMode === 'text' ? (
        <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
      ) : (
        <Textarea
          ref={textareaRef}
          value={markdownText}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          onScroll={handleMarkdownScroll}
          ...
        />
      )}
    </Box>
  </Box>
)
```

#### 1.7 Handle Mode Switching

**Update `handleModeChange` to preserve scroll position when switching modes**:

```javascript
async function handleModeChange(newMode) {
  // Save current scroll position before switching
  const currentScroll = textMode === 'text' 
    ? (scrollContainerRef.current?.scrollTop ?? 0)
    : (textareaRef.current?.scrollTop ?? 0)
  
  // Save scroll position before mode change
  if (currentScroll > 0) {
    await saveScrollPosition(currentScroll)
  }
  
  if (newMode === 'markdown' && textMode === 'text') {
    // Convert blocks to markdown
    const md = await blocksToMarkdownPreservingEmpty(editor, editor.document)
    setMarkdownText(md)
  } else if (newMode === 'text' && textMode === 'markdown') {
    // Convert markdown to blocks
    const blocks = await markdownToBlocksPreservingEmpty(editor, markdownText)
    editor.replaceBlocks(editor.document, blocks)
    saveContent()
  }
  
  setTextMode(newMode)
  
  // Restore scroll position after mode switch (with delay for DOM update)
  setTimeout(() => {
    restoreScrollPosition(currentScroll)
  }, 50)
  
  // Save text mode preference (existing logic)
  if (newMode !== lastSavedTextMode.current) {
    lastSavedTextMode.current = newMode
    try {
      await updateDocumentContent(docId, { text_mode: newMode })
    } catch (err) {
      console.error('Failed to save text mode:', err)
    }
  }
}
```

#### 1.8 Handle Content Changes That Affect Scroll

**When content is loaded or replaced, restore scroll position**:

Add `useEffect` to restore scroll when content or mode changes:
```javascript
useEffect(() => {
  // Restore scroll position when mode changes or content loads
  if (!loading && scrollPosition > 0) {
    const timer = setTimeout(() => {
      restoreScrollPosition(scrollPosition)
    }, 100)
    return () => clearTimeout(timer)
  }
}, [textMode, loading, scrollPosition])
```

---

### 2. API Changes

**File**: `src/lib/api.js`

#### 2.1 Update `updateDocumentContent` Function

**Current** (line 322-338):
```javascript
export async function updateDocumentContent(documentId, { notes_content, drawing_content, layout_mode, layout_ratio, text_mode }) {
  const updates = {}
  if (notes_content !== undefined) updates.notes_content = notes_content
  if (drawing_content !== undefined) updates.drawing_content = drawing_content
  if (layout_mode !== undefined) updates.layout_mode = layout_mode
  if (layout_ratio !== undefined) updates.layout_ratio = layout_ratio
  if (text_mode !== undefined) updates.text_mode = text_mode
  // ... rest of function
}
```

**Updated** (add `editor_scroll_position`):
```javascript
export async function updateDocumentContent(documentId, { notes_content, drawing_content, layout_mode, layout_ratio, text_mode, editor_scroll_position }) {
  const updates = {}
  if (notes_content !== undefined) updates.notes_content = notes_content
  if (drawing_content !== undefined) updates.drawing_content = drawing_content
  if (layout_mode !== undefined) updates.layout_mode = layout_mode
  if (layout_ratio !== undefined) updates.layout_ratio = layout_ratio
  if (text_mode !== undefined) updates.text_mode = text_mode
  if (editor_scroll_position !== undefined) updates.editor_scroll_position = editor_scroll_position
  // ... rest of function
}
```

---

## Database Migration

### Migration File

**File**: `migrations/0.4.0/001_editor_scroll_position.sql`

```sql
-- Add editor_scroll_position column to document_contents table
ALTER TABLE document_contents 
ADD COLUMN editor_scroll_position REAL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN document_contents.editor_scroll_position IS 'Vertical scroll position (in pixels) for the editor in NotesPanel. Restored when document is loaded.';
```

**Rationale**:
- `REAL` type for pixel values (can be fractional due to subpixel rendering)
- Default `0` for backward compatibility (documents without saved scroll start at top)
- No index needed (not used in queries, only stored/retrieved per document)

---

## Implementation Details

### Scroll Position Tracking

**Text Mode (BlockNote)**:
- Scroll container is the parent `<Box>` element with `overflow: 'auto'`
- Track `scrollTop` property via `onScroll` event on the container
- BlockNote editor itself doesn't expose scroll API, so we track the DOM element

**Markdown Mode (Textarea)**:
- Scroll container is the `<Textarea>` element itself
- Track `scrollTop` property via `onScroll` event on the textarea
- Mantine Textarea supports standard DOM scroll events

**Key Considerations**:
- Both modes use standard DOM scrolling (`scrollTop` property)
- Scroll position is in pixels (can be fractional)
- Horizontal scrolling is rare in text editors, so we only track vertical scroll

### Save Frequency

**Scroll Saves**: Debounced save with 1000ms timeout
- Scroll events fire frequently (on every scroll)
- Debouncing prevents excessive database writes
- 1000ms is reasonable for scroll state (not critical for immediate persistence)
- Separate debounce timer from content saves

**Content Saves**: Continue using existing debounced save with 1000ms timeout
- Handles block/markdown content changes
- Separate timer prevents conflicts with scroll saves

### Restoration Timing

**Critical**: Scroll position must be restored AFTER:
1. Content is loaded into editor
2. DOM is fully rendered
3. Editor is ready to accept scroll position

**Strategy**:
- Use `setTimeout` with 100ms delay after content load
- Additional delay may be needed if BlockNote takes time to render
- Consider using `requestAnimationFrame` for more reliable timing

**Edge Cases**:
- Very short documents: Scroll position may be 0 or invalid (handle gracefully)
- Content changes that reduce document height: Clamp scroll position to max scroll
- Mode switching: Preserve scroll position across mode changes when possible

### Backward Compatibility

**Strategy**:
1. When loading documents without scroll position:
   - Default to `0` (start at top)
   - No errors or warnings needed
2. When saving:
   - Always include `editor_scroll_position` if it exists
   - Use nullish coalescing (`??`) to provide defaults
3. Migration:
   - No data migration needed - documents will get scroll position on first save after update
   - Default value of `0` ensures old documents work correctly

---

## Testing Requirements

### Unit Tests

1. **Scroll Position Saving**
   - Scroll in text mode → verify `editor_scroll_position` saved
   - Scroll in markdown mode → verify `editor_scroll_position` saved
   - Verify debouncing works (rapid scrolling doesn't cause excessive saves)
   - Verify scroll position is saved on mode switch

2. **Scroll Position Loading**
   - Load document with saved scroll position → verify scroll restored
   - Load document without scroll position → verify defaults to top (0)
   - Verify scroll restored in both text and markdown modes
   - Verify scroll restored after content loads (timing)

3. **Mode Switching**
   - Switch from text to markdown → verify scroll position preserved
   - Switch from markdown to text → verify scroll position preserved
   - Verify scroll position saved before mode switch

4. **Edge Cases**
   - Very short document (no scroll needed) → verify handles gracefully
   - Content change reduces height → verify scroll clamped to max
   - Rapid document switching → verify scroll position per document

### Integration Tests

1. **Full Flow**
   - Create document → scroll → save → reload → verify scroll restored
   - Create document → scroll → switch mode → verify scroll preserved
   - Multiple documents → verify each document remembers its own scroll position

2. **Edge Cases**
   - Extreme scroll positions (very large numbers)
   - Rapid scrolling → verify debouncing works
   - Network failure during save → verify error handling
   - Document with no content → verify no errors

### Manual Testing Checklist

- [ ] Create new document → scroll → save → reload → verify scroll position restored
- [ ] Create new document → scroll → switch to markdown → verify scroll preserved
- [ ] Create new document → scroll in markdown → switch to text → verify scroll preserved
- [ ] Load old document (no scroll position) → verify no errors, starts at top
- [ ] Multiple documents → verify each document remembers its own scroll position
- [ ] Rapid scrolling → verify debouncing prevents excessive saves
- [ ] Very short document → verify no errors with scroll restoration
- [ ] Content change reduces document height → verify scroll clamped appropriately

---

## Performance Considerations

### Save Frequency
- **Scroll Saves**: Debounced 1000ms saves via `onScroll` events
  - Only fires on scroll changes
  - Debouncing limits frequency to reasonable rate
- **Content Saves**: Separate debounced 1000ms saves via content change handlers
  - Only fires on content changes
- **Impact**: Scroll changes trigger saves, but debouncing limits frequency
- **Benefit**: Separate timers prevent conflicts between scroll and content saves

### Data Size
- **Additional Data**: 4-8 bytes per document (REAL type)
- **Impact**: Negligible for database storage
- **Scalability**: No concerns

### Network Traffic
- **Impact**: Slightly larger payloads on save (one additional field)
- **Mitigation**: Debouncing already limits save frequency
- **Benefit**: Scroll position saved separately from content, reducing conflicts

### DOM Performance
- **Scroll Event Frequency**: Can fire many times per second
- **Mitigation**: Debouncing reduces handler execution
- **Consideration**: `onScroll` events are native and efficient, but debouncing is still important

---

## Security Considerations

1. **Input Validation**: Scroll position is numeric - validate ranges if needed (clamp to reasonable values)
2. **RLS Policies**: No changes needed (scroll position is part of document content)
3. **XSS**: No concerns (scroll position is numeric, not rendered as HTML)

---

## Future Enhancements (Out of Scope)

1. **Per-User Scroll State**: Store different scroll position for each collaborator
2. **Scroll History**: Track scroll position changes over time
3. **Smart Scroll Restoration**: Auto-scroll to last edited position
4. **Horizontal Scroll Tracking**: If horizontal scrolling becomes relevant
5. **Cursor Position Tracking**: Remember cursor position in addition to scroll
6. **Selection State**: Remember selected text
7. **Viewport Dimensions**: Store viewport size for better restoration

---

## Success Criteria

1. ✅ Scroll position is saved to database per document
2. ✅ Scroll position is restored when loading documents
3. ✅ Works in both text mode (BlockNote) and markdown mode (Textarea)
4. ✅ Backward compatibility maintained (old documents work)
5. ✅ No performance degradation
6. ✅ No breaking changes to existing functionality
7. ✅ All tests pass
8. ✅ User's scroll context preserved across sessions

---

## Implementation Notes

### DOM Element References

**Text Mode**:
- Scroll container: Parent `<Box>` with `overflow: 'auto'`
- Use `ref={scrollContainerRef}` on the Box element
- Track `scrollTop` via `onScroll` event

**Markdown Mode**:
- Scroll container: `<Textarea>` element itself
- Use `ref={textareaRef}` on the Textarea component
- Track `scrollTop` via `onScroll` event

### Timing Considerations

**Critical Timing Issues**:
1. BlockNote may take time to render content
2. DOM must be ready before setting scroll position
3. Content loading is async, scroll restoration must wait

**Solution**:
- Use `setTimeout` with appropriate delays (100ms+)
- Consider `requestAnimationFrame` for more reliable timing
- May need to increase delay if BlockNote rendering is slow

### Scroll Position Clamping

**Edge Case**: Content changes that reduce document height
- If saved scroll position > max scroll, clamp to max
- Calculate max scroll: `scrollHeight - clientHeight`
- Apply clamping when restoring scroll position

**Implementation**:
```javascript
function restoreScrollPosition(scrollTop) {
  if (textMode === 'text') {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const maxScroll = container.scrollHeight - container.clientHeight
      container.scrollTop = Math.min(scrollTop, maxScroll)
    }
  } else {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const maxScroll = textarea.scrollHeight - textarea.clientHeight
      textarea.scrollTop = Math.min(scrollTop, maxScroll)
    }
  }
}
```

---

## Appendix: Example Data Structures

### Document Contents with Scroll Position

```json
{
  "id": 1,
  "document_id": 123,
  "notes_content": [...],
  "drawing_content": {...},
  "layout_mode": "both",
  "layout_ratio": 50.0,
  "text_mode": "text",
  "editor_scroll_position": 450.5,
  "updated_at": "2024-12-17T10:30:00Z"
}
```

### Scroll Position Values

- **0**: At the top of the document
- **450.5**: Scrolled down 450.5 pixels (can be fractional due to subpixel rendering)
- **Max value**: Depends on document height (scrollHeight - clientHeight)
