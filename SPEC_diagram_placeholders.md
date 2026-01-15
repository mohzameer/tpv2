# Specification: Declarative Diagram Placeholders

## Version
0.4.0

## Date
2024-12-18

## Overview
Implement a declarative placeholder system that allows users to embed diagrams (drawing documents) within text documents using simple text placeholders. The placeholders are stored as plain text in BlockNote, and are replaced with actual diagram renderings during display.

**Core Principle**: The editor stores text placeholders, and the renderer replaces them deterministically. No DOM measurement, no overlay positioning, no editor lifecycle coupling.

## Goals
1. Enable users to link diagrams from text documents using declarative placeholders
2. Store placeholders as plain text (no schema changes to BlockNote)
3. Replace placeholders with diagram renderings during display
4. Support both block-level (`:::diagram key:::`) and inline (`[diagram:key]`) syntax
5. Provide visual feedback while editing (badges, hover previews)
6. Make placeholders survive markdown export, git diffs, copy/paste, and read-only rendering
7. Work seamlessly with the unified document architecture

## Non-Goals
- Custom BlockNote block types (we use plain text)
- DOM-based overlay positioning
- Real-time diagram updates in placeholders (diagrams are rendered statically)
- Editing diagrams from within placeholders (users navigate to the drawing document)
- Automatic diagram creation from placeholders

## Architecture Context

This specification builds on:
- **Unified document architecture** (see `SPEC_unified_document_architecture.md`)
- **Per-project document numbering** (see `SPEC_per_project_document_numbering.md`)
- BlockNote editor in `NotesPanel`
- Excalidraw in `DrawingPanel`

Documents can be either:
- **Text documents** (`document_type = 'text'`): Use BlockNote editor
- **Drawing documents** (`document_type = 'drawing'`): Use Excalidraw canvas

Both types are shown in a unified document list and share the same numbering sequence per project.

---

## Placeholder Syntax

### Block-Level Placeholders
```
:::diagram system-architecture:::
```

- Starts with `:::diagram`
- Followed by whitespace
- Followed by the diagram key (alphanumeric, hyphens, underscores)
- Ends with `:::`
- Must be on its own line (or entire block content)

### Inline Placeholders
```
[diagram:system-architecture]
```

- Markdown-style link syntax
- Format: `[diagram:key]`
- Can appear inline with other text

### Diagram Key Rules
- **Key format**: Alphanumeric characters, hyphens (`-`), underscores (`_`)
- **Case-insensitive matching**: `system-architecture` matches `System-Architecture`
- **Key resolution**: Matches drawing document by:
  1. Document title (normalized, case-insensitive)
  2. Document number (if key is numeric)
  3. Document ID (if key is a valid UUID/text ID)

### Examples
```
:::diagram system-architecture:::
:::diagram user-flow:::
:::diagram api-design:::

This is inline text with [diagram:system-architecture] embedded.

You can also reference by number: [diagram:1] or :::diagram:2:::
```

---

## Implementation Architecture

### 1. Placeholder Storage

Placeholders are stored as **plain text** in BlockNote blocks:

```json
{
  "type": "paragraph",
  "content": ":::diagram system-architecture:::"
}
```

Or inline:
```json
{
  "type": "paragraph",
  "content": [
    "Check out this ",
    { "type": "text", "text": "[diagram:system-architecture]" },
    " diagram."
  ]
}
```

**No schema changes required** - BlockNote treats placeholders as normal text.

### 2. Placeholder Parsing

**File**: `src/lib/diagramPlaceholders.js`

#### 2.1 Extract Placeholders from Block
```javascript
/**
 * Extract diagram placeholders from a BlockNote block
 * @param {Object} block - BlockNote block
 * @returns {Array} Array of placeholder objects: [{ blockId, drawingKey, format, startIndex, endIndex }]
 */
function extractDiagramPlaceholders(block) {
  const placeholders = []
  
  // Get plain text content
  const text = getBlockPlainText(block)
  
  // Match block-level: :::diagram key:::
  const blockRegex = /:::diagram\s+([\w-]+):::/g
  let match
  while ((match = blockRegex.exec(text)) !== null) {
    placeholders.push({
      blockId: block.id,
      drawingKey: match[1],
      format: 'block',
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  // Match inline: [diagram:key]
  const inlineRegex = /\[diagram:([\w-]+)\]/g
  while ((match = inlineRegex.exec(text)) !== null) {
    placeholders.push({
      blockId: block.id,
      drawingKey: match[1],
      format: 'inline',
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  return placeholders
}
```

#### 2.2 Get Block Plain Text
```javascript
/**
 * Extract plain text from a BlockNote block
 * @param {Object} block - BlockNote block
 * @returns {string} Plain text content
 */
function getBlockPlainText(block) {
  if (!block?.content) return ''
  
  if (Array.isArray(block.content)) {
    return block.content
      .map(item => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item.text) return item.text
        return ''
      })
      .join('')
  }
  
  if (typeof block.content === 'string') {
    return block.content
  }
  
  return ''
}
```

### 3. Diagram Lookup

**File**: `src/lib/diagramPlaceholders.js`

#### 3.1 Find Drawing Document by Key
```javascript
/**
 * Find a drawing document by key (title, number, or ID)
 * @param {Array} documents - All documents in the project
 * @param {string} key - Diagram key to match
 * @returns {Object|null} Drawing document or null
 */
function findDrawingByKey(documents, key) {
  if (!documents || !key) return null
  
  // Normalize key for comparison
  const normalizedKey = key.toLowerCase().trim()
  
  // Try matching by document number (if key is numeric)
  if (/^\d+$/.test(normalizedKey)) {
    const docNumber = parseInt(normalizedKey, 10)
    const byNumber = documents.find(d => 
      d.document_type === 'drawing' && 
      d.document_number === docNumber
    )
    if (byNumber) return byNumber
  }
  
  // Try matching by document ID (if key looks like an ID)
  const byId = documents.find(d => 
    d.document_type === 'drawing' && 
    d.id === key
  )
  if (byId) return byId
  
  // Try matching by title (normalized, case-insensitive)
  const byTitle = documents.find(d => {
    if (d.document_type !== 'drawing') return false
    const normalizedTitle = (d.title || '').toLowerCase().trim()
    return normalizedTitle === normalizedKey
  })
  if (byTitle) return byTitle
  
  // Try partial title match (if exact match fails)
  const byPartialTitle = documents.find(d => {
    if (d.document_type !== 'drawing') return false
    const normalizedTitle = (d.title || '').toLowerCase().trim()
    // Remove common prefixes like "drawing-", "diagram-"
    const cleanTitle = normalizedTitle.replace(/^(drawing|diagram)-/, '')
    return cleanTitle === normalizedKey || normalizedTitle.includes(normalizedKey)
  })
  if (byPartialTitle) return byPartialTitle
  
  return null
}
```

### 4. Diagram Renderer Component

**File**: `src/components/DiagramRenderer.jsx`

#### 4.1 Component Structure
```javascript
import { useState, useEffect } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import { getDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { Loader, Center, Text, Box } from '@mantine/core'

/**
 * Renders an Excalidraw diagram from a drawing document
 * @param {string} drawingDocId - ID of the drawing document
 * @param {string} format - 'block' or 'inline'
 * @param {Object} options - Rendering options
 */
export default function DiagramRenderer({ drawingDocId, format = 'block', options = {} }) {
  const [drawingData, setDrawingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { colorScheme } = useTheme()
  
  useEffect(() => {
    loadDiagram()
  }, [drawingDocId])
  
  async function loadDiagram() {
    try {
      setLoading(true)
      const content = await getDocumentContent(drawingDocId)
      
      if (!content?.drawing_content) {
        setError('Drawing not found')
        return
      }
      
      setDrawingData(content.drawing_content)
    } catch (err) {
      setError('Failed to load diagram')
      console.error('DiagramRenderer: Failed to load diagram:', err)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <Center style={{ padding: '20px' }}>
        <Loader size="sm" />
      </Center>
    )
  }
  
  if (error) {
    return (
      <Box style={{ padding: '20px', textAlign: 'center' }}>
        <Text c="dimmed" size="sm">{error}</Text>
      </Box>
    )
  }
  
  if (!drawingData) {
    return null
  }
  
  // Block-level: full width, larger height
  if (format === 'block') {
    return (
      <Box style={{ 
        width: '100%', 
        height: '400px', 
        border: `1px solid ${colorScheme === 'dark' ? '#444' : '#ddd'}`,
        borderRadius: '4px',
        margin: '16px 0',
        overflow: 'hidden'
      }}>
        <Excalidraw
          initialData={drawingData}
          viewModeEnabled={true}
          zenModeEnabled={false}
          theme={colorScheme}
        />
      </Box>
    )
  }
  
  // Inline: smaller, compact view
  return (
    <Box 
      component="span"
      style={{ 
        display: 'inline-block',
        width: '200px',
        height: '150px',
        border: `1px solid ${colorScheme === 'dark' ? '#444' : '#ddd'}`,
        borderRadius: '4px',
        margin: '0 4px',
        verticalAlign: 'middle',
        overflow: 'hidden'
      }}
    >
      <Excalidraw
        initialData={drawingData}
        viewModeEnabled={true}
        zenModeEnabled={false}
        theme={colorScheme}
      />
    </Box>
  )
}
```

### 5. BlockNote Integration

**File**: `src/components/NotesPanel.jsx`

#### 5.1 Custom Block Renderer

BlockNote doesn't natively support custom block rendering for paragraph blocks. We'll use a **wrapper approach**:

1. **Parse placeholders** from the document after it loads
2. **Transform blocks** before rendering (replace placeholder text with diagram components)
3. **Use a custom renderer** that intercepts block rendering

**Approach**: Create a custom component that wraps `BlockNoteView` and intercepts block rendering:

```javascript
// In NotesPanel.jsx
import { useMemo } from 'react'
import { extractDiagramPlaceholders, findDrawingByKey } from '../lib/diagramPlaceholders'
import DiagramRenderer from './DiagramRenderer'
import { useProjectContext } from '../context/ProjectContext'

export default function NotesPanel({ docId }) {
  const { documents } = useProjectContext()
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  
  // Parse placeholders and create render map
  const diagramRenderMap = useMemo(() => {
    if (!editor || !documents) return new Map()
    
    const map = new Map() // blockId -> { placeholders: [...], renderData: [...] }
    
    editor.document.forEach(block => {
      const placeholders = extractDiagramPlaceholders(block)
      if (placeholders.length === 0) return
      
      const renderData = placeholders.map(ph => {
        const drawingDoc = findDrawingByKey(documents, ph.drawingKey)
        return {
          ...ph,
          drawingDocId: drawingDoc?.id || null,
          found: !!drawingDoc
        }
      })
      
      map.set(block.id, { placeholders, renderData })
    })
    
    return map
  }, [editor?.document, documents])
  
  // Custom block renderer component
  const CustomBlockNoteView = useMemo(() => {
    // We'll need to intercept BlockNote's rendering
    // This requires a custom approach since BlockNote doesn't expose block-level customization
    // Option 1: Post-process DOM after render
    // Option 2: Use BlockNote's blockSpecs to create a custom block type (but we want to avoid this)
    // Option 3: Use a wrapper that replaces content after BlockNote renders
    
    return BlockNoteView
  }, [])
  
  return (
    // ... existing JSX ...
    <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
  )
}
```

#### 5.2 Post-Render DOM Transformation

Since BlockNote doesn't support custom paragraph rendering, we'll use a **post-render DOM transformation**:

```javascript
// In NotesPanel.jsx
useEffect(() => {
  if (!editor || !documents || diagramRenderMap.size === 0) return
  
  const transformPlaceholders = () => {
    const editorEl = document.querySelector('.bn-editor')
    if (!editorEl) return
    
    // Find all blocks with placeholders
    diagramRenderMap.forEach(({ placeholders, renderData }, blockId) => {
      // Find the DOM element for this block
      const blockEl = editorEl.querySelector(`[data-node-id="${blockId}"]`)
      if (!blockEl) return
      
      placeholders.forEach((ph, index) => {
        const { drawingDocId, found, format } = renderData[index]
        if (!drawingDocId) return
        
        // Find the placeholder text in the DOM
        const textContent = blockEl.textContent || ''
        const placeholderText = format === 'block' 
          ? `:::diagram ${ph.drawingKey}:::`
          : `[diagram:${ph.drawingKey}]`
        
        // Create a container for the diagram
        const diagramContainer = document.createElement('div')
        diagramContainer.className = 'diagram-placeholder-rendered'
        diagramContainer.setAttribute('data-placeholder-key', ph.drawingKey)
        diagramContainer.setAttribute('data-format', format)
        
        // Render React component into container
        // We'll use ReactDOM.render or a portal
        // ... (implementation details)
      })
    })
  }
  
  // Run transformation after BlockNote renders
  const observer = new MutationObserver(() => {
    transformPlaceholders()
  })
  
  const editorEl = document.querySelector('.bn-editor')
  if (editorEl) {
    observer.observe(editorEl, { childList: true, subtree: true })
    transformPlaceholders()
  }
  
  return () => observer.disconnect()
}, [editor, documents, diagramRenderMap])
```

**Note**: This DOM manipulation approach is fragile. A better approach is to use BlockNote's **custom block specs** or **content transformation** if available.

#### 5.3 Alternative: Custom Block Spec (Recommended)

Create a custom block type for diagram placeholders:

```javascript
// In NotesPanel.jsx
import { createBlockSpec } from '@blocknote/core'

const diagramBlockSpec = createBlockSpec({
  type: 'diagram',
  propSchema: {
    drawingKey: {
      default: '',
    },
    format: {
      default: 'block',
    },
  },
  content: 'none', // No inline content
  toExternalHTML: (block) => {
    return `<div data-diagram-key="${block.props.drawingKey}"></div>`
  },
  parse: (element) => {
    // Parse from HTML/markdown
    const key = element.getAttribute('data-diagram-key')
    if (key) {
      return {
        type: 'diagram',
        props: { drawingKey: key, format: 'block' }
      }
    }
    return null
  },
})

// Add to schema
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...markdownBlocks,
    diagram: diagramBlockSpec,
  },
})
```

**However**, this requires schema changes and migration. The **text-based approach** is simpler and more compatible.

### 6. Editing Experience Enhancements

#### 6.1 Visual Badge for Placeholders

While editing, show a subtle badge/indicator for diagram placeholders:

```javascript
// In NotesPanel.jsx or a custom component
function DiagramPlaceholderBadge({ blockId, drawingKey, found }) {
  return (
    <span
      className="diagram-placeholder-badge"
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        margin: '0 2px',
        backgroundColor: found ? '#e3f2fd' : '#ffebee',
        color: found ? '#1976d2' : '#c62828',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 500,
      }}
      title={found ? `Diagram: ${drawingKey}` : `Diagram not found: ${drawingKey}`}
    >
      📊 {drawingKey}
    </span>
  )
}
```

#### 6.2 Hover Preview (Optional)

Show a preview of the diagram on hover:

```javascript
function DiagramPlaceholderTooltip({ drawingDocId, children }) {
  const [showPreview, setShowPreview] = useState(false)
  
  return (
    <span
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      {children}
      {showPreview && (
        <div className="diagram-preview-tooltip">
          <DiagramRenderer drawingDocId={drawingDocId} format="block" />
        </div>
      )}
    </span>
  )
}
```

#### 6.3 Slash Command Helper (Future)

Add a slash command to insert diagram placeholders:

```
/diagram -> Shows list of available drawings
```

---

## File Structure

```
src/
├── lib/
│   └── diagramPlaceholders.js       # Parsing and lookup utilities
├── components/
│   ├── NotesPanel.jsx                # Modified: integrate placeholder rendering
│   ├── DiagramRenderer.jsx           # New: renders Excalidraw diagrams
│   └── DiagramPlaceholderBadge.jsx   # New: visual indicator while editing
└── context/
    └── ProjectContext.jsx            # Already exists: provides documents list
```

---

## Data Flow

1. **User types placeholder**: `:::diagram system-architecture:::`
2. **BlockNote stores as text**: Block content is plain text
3. **On render**: 
   - Parse placeholders from blocks
   - Look up drawing documents by key
   - Replace placeholder text with `DiagramRenderer` component
4. **DiagramRenderer loads**: Fetches drawing content from API
5. **Excalidraw renders**: Shows diagram in view-only mode

---

## Edge Cases

### Missing Diagrams
- Show "Diagram not found: {key}" message
- Optionally show a link to create the diagram
- Badge shows error state (red)

### Multiple Placeholders in One Block
- Support multiple placeholders per block
- Render each placeholder separately
- Maintain order

### Deleted Diagrams
- Detect when a referenced diagram is deleted
- Show "Diagram deleted" message
- Optionally offer to remove placeholder

### Diagram Updates
- Diagrams are rendered statically (not live)
- User must refresh page to see updates
- Future: Add "refresh" button to update diagram

### Case Sensitivity
- Keys are matched case-insensitively
- "System-Architecture" matches "system-architecture"
- Document titles are normalized for matching

---

## Performance Considerations

1. **Lazy Loading**: Only load diagram content when placeholder is visible
2. **Caching**: Cache loaded diagrams to avoid re-fetching
3. **Debouncing**: Debounce placeholder parsing during editing
4. **Virtual Scrolling**: For documents with many placeholders

---

## Testing Strategy

1. **Unit Tests**:
   - Placeholder parsing (block and inline formats)
   - Key matching (title, number, ID)
   - Edge cases (missing diagrams, invalid keys)

2. **Integration Tests**:
   - Placeholder rendering in BlockNote
   - Diagram loading and display
   - Editing experience (badges, tooltips)

3. **Manual Testing**:
   - Create text document with placeholders
   - Create drawing documents with various titles
   - Test key matching (exact, partial, number)
   - Test markdown export (placeholders should be preserved)
   - Test copy/paste (placeholders should be preserved)

---

## Migration Strategy

**No migration required** - placeholders are stored as plain text, so existing documents work without changes.

However, we should:
1. Document the feature for users
2. Provide examples in help/README
3. Consider adding a "Insert Diagram" button in the UI

---

## Future Enhancements

1. **Live Updates**: Refresh diagrams when source drawing changes
2. **Diagram Thumbnails**: Show thumbnail instead of full render for performance
3. **Diagram Editor**: Quick-edit diagrams from placeholder
4. **Slash Commands**: `/diagram` command to insert placeholders
5. **Auto-complete**: Suggest diagram keys while typing
6. **Diagram Gallery**: Visual picker for inserting diagrams
7. **Export Support**: Render diagrams in markdown/PDF exports

---

## Open Questions

1. **Rendering Approach**: DOM transformation vs custom block spec?
   - **Decision**: Start with DOM transformation (simpler), migrate to custom block spec if needed

2. **Key Matching**: Exact title match vs fuzzy matching?
   - **Decision**: Exact match first, then partial match as fallback

3. **Inline vs Block**: Should inline diagrams be clickable to expand?
   - **Decision**: Start with static inline render, add expand on click later

4. **Performance**: How many diagrams can be rendered before performance degrades?
   - **Decision**: Implement lazy loading and virtual scrolling if needed

---

## Implementation Checklist

- [ ] Create `src/lib/diagramPlaceholders.js` with parsing utilities
- [ ] Create `src/components/DiagramRenderer.jsx` component
- [ ] Modify `src/components/NotesPanel.jsx` to integrate placeholders
- [ ] Add visual badges for placeholders while editing
- [ ] Test placeholder parsing (block and inline formats)
- [ ] Test diagram lookup (title, number, ID matching)
- [ ] Test diagram rendering (block and inline formats)
- [ ] Test edge cases (missing diagrams, invalid keys)
- [ ] Add error handling and loading states
- [ ] Test markdown export (placeholders preserved)
- [ ] Test copy/paste (placeholders preserved)
- [ ] Document feature for users

---

## References

- BlockNote Documentation: https://www.blocknotejs.org/
- Excalidraw Documentation: https://docs.excalidraw.com/
- Unified Document Architecture: `SPEC_unified_document_architecture.md`
- Per-Project Document Numbering: `SPEC_per_project_document_numbering.md`
