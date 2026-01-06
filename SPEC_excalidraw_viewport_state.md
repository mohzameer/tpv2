# Specification: Excalidraw Viewport State Persistence

## Version
0.4.0

## Date
2024-12-17

## Overview
Extend the Excalidraw state persistence to include viewport information (scroll position and zoom level) so that users' canvas view is preserved when they return to a document. Currently, only `viewBackgroundColor` is saved from `appState`; this spec adds support for `scrollX`, `scrollY`, `zoom`, and other relevant viewport properties.

## Goals
1. Store viewport state (scroll position, zoom level) in `drawing_content.appState`
2. Restore viewport state when loading documents
3. Preserve user's view context across sessions
4. Maintain backward compatibility with existing documents
5. Handle viewport state updates efficiently (debounced saves)

## Non-Goals
- Storing per-user viewport preferences (viewport is document-level, not user-level)
- Storing temporary UI state (e.g., tool selection, cursor position)
- Storing collaboration-specific viewport state (future enhancement)
- Migrating existing documents to include viewport state

---

## Current State Analysis

### Current Implementation
**File**: `src/components/DrawingPanel.jsx`

Currently, the `saveContent` function only saves:
```javascript
appState: { viewBackgroundColor: appState.viewBackgroundColor }
```

This means:
- ✅ Elements are saved
- ✅ Background color is saved
- ❌ Scroll position is lost
- ❌ Zoom level is lost
- ❌ Other viewport state is lost

### Excalidraw API for Viewport State

**Confirmed API Capabilities** (per official Excalidraw documentation):

1. **`onChange` callback**: Provides full `appState` including viewport state
   ```javascript
   onChange: (elements, appState, files) => void
   ```
   - `appState.scrollX` (number): Horizontal scroll position
   - `appState.scrollY` (number): Vertical scroll position
   - `appState.zoom.value` (number): Current zoom level (e.g., 1.0 = 100%)
   - `appState.zoom.offsetX` (number): Zoom offset X
   - `appState.zoom.offsetY` (number): Zoom offset Y

2. **`onScrollChange` callback** (alternative/optimization): Dedicated callback for viewport changes
   ```javascript
   onScrollChange?: (scrollX: number, scrollY: number, zoom: Zoom) => void
   ```
   - More efficient for viewport-only updates (doesn't fire on element changes)
   - Provides same viewport data as `onChange` but only when scroll/zoom changes

3. **Restoration via `initialData`**: Can restore viewport state on load
   ```javascript
   initialData: {
     elements: [...],
     appState: { scrollX, scrollY, zoom },
     scrollToContent: false  // Prevents auto-scroll
   }
   ```

4. **Restoration via `updateScene()`**: Can programmatically update viewport
   ```javascript
   updateScene({ appState: { scrollX, scrollY, zoom } })
   ```

**Important Notes**:
- ✅ Excalidraw **does** expose scroll/zoom state via API
- ✅ You **can** store and restore viewport state
- ❌ Excalidraw **does NOT** automatically persist viewport in file JSON by default
- ✅ Custom handling is required (which this spec addresses)

### Implementation Approach

**Primary Method**: Use `onScrollChange` callback for viewport + `onChange` for elements
- **`onScrollChange`**: Dedicated callback for viewport changes (scroll/zoom)
  - More efficient: only fires on viewport changes, not element changes
  - Provides: `scrollX`, `scrollY`, `zoom` directly
- **`onChange`**: Continue using for element changes and background color
  - Handles: `elements`, `appState.viewBackgroundColor`
- **Separation of Concerns**: Viewport state tracked separately from element state
- **Performance**: Reduces unnecessary saves when only viewport changes

### Viewport State Properties

The `onScrollChange` callback provides:

**Viewport Properties** (to be saved):
- `scrollX` (number): Horizontal scroll position
- `scrollY` (number): Vertical scroll position
- `zoom` (object): Zoom level and related state
  - `value` (number): Current zoom level (e.g., 1.0 = 100%)
  - `offsetX` (number): Zoom offset X (may be undefined, default to 0)
  - `offsetY` (number): Zoom offset Y (may be undefined, default to 0)

**UI State Properties** (optional, may be saved):
- `viewBackgroundColor` (string): Canvas background color (already saved)
- `gridSize` (number): Grid size setting
- `theme` (string): Light/dark theme (handled separately via ThemeContext)

**Temporary State** (should NOT be saved):
- `selectedElementIds`: Current selection
- `editingElement`: Currently editing element
- `editingGroupId`: Currently editing group
- `activeTool`: Current tool
- `cursorButton`: Mouse button state
- `draggingElement`: Drag state
- `resizingElement`: Resize state
- `multiElement`: Multi-element state
- `previousSelectedElementIds`: Previous selection
- `selectedGroupIds`: Selected groups
- `selectedLinearElement`: Selected linear element
- `selectionElement`: Selection element
- `startBoundElement`: Start bound element
- `suggestedBindings`: Suggested bindings
- `isBindingEnabled`: Binding enabled state
- `isRotating`: Rotation state
- `isResizing`: Resize state
- `zoom`: Full zoom object (we only need `value`, `offsetX`, `offsetY`)

---

## Database Schema

### Current Schema
**Table**: `document_contents`
**Column**: `drawing_content` (JSONB)

**Current Structure**:
```json
{
  "elements": [...],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  }
}
```

### Updated Structure
**No schema changes required** - JSONB column can store the additional properties.

**New Structure**:
```json
{
  "elements": [...],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "scrollX": 0,
    "scrollY": 0,
    "zoom": {
      "value": 1.0,
      "offsetX": 0,
      "offsetY": 0
    }
  }
}
```

**Backward Compatibility**:
- Documents without viewport state will default to `scrollX: 0`, `scrollY: 0`, `zoom: { value: 1.0 }`
- Excalidraw handles missing properties gracefully

---

## Application Code Changes

### 1. DrawingPanel Component

**File**: `src/components/DrawingPanel.jsx`

#### 1.1 Add Viewport State Management

**Add state to track viewport**:
```javascript
const [viewportState, setViewportState] = useState({
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1.0, offsetX: 0, offsetY: 0 }
})
```

#### 1.2 Add `onScrollChange` Handler

**Add new handler for viewport changes**:
```javascript
const viewportSaveTimeout = useRef(null)

function handleScrollChange(scrollX, scrollY, zoom) {
  // Update local state immediately for UI responsiveness
  setViewportState({ scrollX, scrollY, zoom })
  
  // Debounce save to database
  if (viewportSaveTimeout.current) clearTimeout(viewportSaveTimeout.current)
  viewportSaveTimeout.current = setTimeout(() => {
    saveViewportState(scrollX, scrollY, zoom)
  }, 1000)
}

async function saveViewportState(scrollX, scrollY, zoom) {
  if (!docId) return
  
  // Get current content to merge viewport state
  const content = await getDocumentContent(docId)
  const currentContent = content?.drawing_content || { elements: [], appState: {} }
  
  // Merge viewport state with existing appState
  const updatedAppState = {
    ...currentContent.appState,
    scrollX: scrollX ?? 0,
    scrollY: scrollY ?? 0,
    zoom: zoom ? {
      value: zoom.value ?? 1.0,
      offsetX: zoom.offsetX ?? 0,
      offsetY: zoom.offsetY ?? 0
    } : { value: 1.0, offsetX: 0, offsetY: 0 }
  }
  
  const newContent = {
    elements: currentContent.elements || [],
    appState: updatedAppState
  }
  
  const contentString = JSON.stringify(newContent)
  if (contentString === lastSavedContent.current) return
  
  try {
    setIsSyncing(true)
    await updateDocumentContent(docId, { drawing_content: newContent })
    lastSavedContent.current = contentString
  } catch (err) {
    console.error('Failed to save viewport state:', err)
  } finally {
    setIsSyncing(false)
  }
}
```

#### 1.3 Update `saveContent` Function (for elements)

**Current** (line 48-63):
```javascript
async function saveContent(elements, appState) {
  if (!docId) return
  const newContent = { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } }
  // ... rest of function
}
```

**Updated** (merge with existing viewport state):
```javascript
async function saveContent(elements, appState) {
  if (!docId) return
  
  // Get current viewport state from local state
  const currentViewport = viewportState
  
  // Merge elements, background color, and viewport state
  const newContent = {
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      scrollX: currentViewport.scrollX,
      scrollY: currentViewport.scrollY,
      zoom: currentViewport.zoom
    }
  }
  
  const currentContent = JSON.stringify(newContent)
  if (currentContent === lastSavedContent.current) return
  
  try {
    setIsSyncing(true)
    await updateDocumentContent(docId, { drawing_content: newContent })
    lastSavedContent.current = currentContent
  } catch (err) {
    console.error('Failed to save drawing:', err)
  } finally {
    setIsSyncing(false)
  }
}
```

#### 1.2 Update `loadContent` Function

**Current** (line 24-39):
```javascript
async function loadContent() {
  try {
    const content = await getDocumentContent(docId)
    if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
      setInitialData(content.drawing_content)
      lastSavedContent.current = JSON.stringify(content.drawing_content)
    } else {
      const defaultData = { elements: [], appState: {} }
      setInitialData(defaultData)
      lastSavedContent.current = JSON.stringify(defaultData)
    }
  } catch (err) {
    console.error('Failed to load drawing:', err)
    setInitialData({ elements: [], appState: {} })
  }
}
```

**Updated** (ensure proper structure and initialize viewport state):
```javascript
async function loadContent() {
  try {
    const content = await getDocumentContent(docId)
    if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
      // Ensure appState has proper structure for backward compatibility
      const drawingContent = content.drawing_content
      if (!drawingContent.appState) {
        drawingContent.appState = {}
      }
      
      // Set defaults for missing viewport properties
      const scrollX = drawingContent.appState.scrollX ?? 0
      const scrollY = drawingContent.appState.scrollY ?? 0
      const zoom = drawingContent.appState.zoom || { value: 1.0, offsetX: 0, offsetY: 0 }
      
      // Initialize viewport state from loaded content
      setViewportState({ scrollX, scrollY, zoom })
      
      // Ensure appState has all viewport properties
      drawingContent.appState = {
        ...drawingContent.appState,
        scrollX,
        scrollY,
        zoom
      }
      
      setInitialData(drawingContent)
      lastSavedContent.current = JSON.stringify(drawingContent)
    } else {
      const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
      setViewportState(defaultViewport)
      
      const defaultData = {
        elements: [],
        appState: defaultViewport
      }
      setInitialData(defaultData)
      lastSavedContent.current = JSON.stringify(defaultData)
    }
  } catch (err) {
    console.error('Failed to load drawing:', err)
    const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
    setViewportState(defaultViewport)
    setInitialData({
      elements: [],
      appState: defaultViewport
    })
  }
}
```

#### 1.4 Update Excalidraw Component Props

**Current** (line 75-82):
```javascript
<Excalidraw
  key={`${docId}-${user?.id || 'guest'}`}
  ref={excalidrawRef}
  initialData={initialData}
  zenModeEnabled={true}
  onChange={handleChange}
  theme={colorScheme}
/>
```

**Updated** (add `onScrollChange` and `scrollToContent: false`):
```javascript
<Excalidraw
  key={`${docId}-${user?.id || 'guest'}`}
  ref={excalidrawRef}
  initialData={{
    ...initialData,
    scrollToContent: false  // Prevent auto-scroll, use saved scroll position
  }}
  zenModeEnabled={true}
  onChange={handleChange}  // Handles elements and background color
  onScrollChange={handleScrollChange}  // Handles viewport state (scroll/zoom)
  theme={colorScheme}
/>
```

**Note**: The `scrollToContent` property should be set to `false` in the `initialData` object to prevent Excalidraw from automatically scrolling to content, which would override the saved scroll position.

---

## Implementation Details

### 2. Viewport State Extraction

**Approach**: Use `onScrollChange` callback for viewport-only updates
- More efficient: only fires on scroll/zoom changes, not element changes
- Provides direct access to `scrollX`, `scrollY`, and `zoom` parameters
- Separates viewport state management from element state management
- Uses separate debounce timer for viewport saves

**Key Properties from `onScrollChange` Callback**:

1. **scrollX** (number): Horizontal scroll position in pixels
   - Default: `0`
   - Range: Can be negative or positive (unbounded)

2. **scrollY** (number): Vertical scroll position in pixels
   - Default: `0`
   - Range: Can be negative or positive (unbounded)

3. **zoom** (object): Zoom level and offset
   - `value` (number): Zoom multiplier (1.0 = 100%, 2.0 = 200%, etc.)
     - Default: `1.0`
     - Typical range: `0.1` to `10.0`
   - `offsetX` (number): Zoom offset X in pixels
     - Default: `0`
   - `offsetY` (number): Zoom offset Y in pixels
     - Default: `0`

### 3. Save Frequency

**Viewport Saves**: Separate debounced save with 1000ms timeout for `onScrollChange`
- Viewport changes are frequent (on every scroll/zoom)
- Debouncing prevents excessive saves
- 1000ms is reasonable for viewport state
- Separate from element saves (which use `onChange`)

**Element Saves**: Continue using existing debounced save with 1000ms timeout for `onChange`
- Handles element changes and background color
- Separate debounce timer prevents conflicts with viewport saves

### 4. Backward Compatibility

**Strategy**:
1. When loading documents without viewport state:
   - Default to `scrollX: 0`, `scrollY: 0`
   - Default to `zoom: { value: 1.0, offsetX: 0, offsetY: 0 }`
   - Excalidraw will center/zoom-to-fit on first load (expected behavior)

2. When saving:
   - Always include all viewport properties
   - Use nullish coalescing (`??`) to provide defaults

3. Migration:
   - No migration needed - documents will get viewport state on first save after update

---

## Testing Requirements

### Unit Tests

1. **Viewport State Saving**
   - Save document with scroll position → verify `scrollX`, `scrollY` saved
   - Save document with zoom level → verify `zoom.value` saved
   - Save document with zoom offset → verify `zoom.offsetX`, `zoom.offsetY` saved
   - Verify all viewport properties included in save

2. **Viewport State Loading**
   - Load document with saved scroll position → verify scroll position restored
   - Load document with saved zoom level → verify zoom level restored
   - Load document without viewport state → verify defaults applied
   - Verify `scrollToContent: false` prevents auto-scroll

3. **Backward Compatibility**
   - Load old document (no viewport state) → verify no errors
   - Load old document → verify defaults applied
   - Save old document → verify viewport state added

### Integration Tests

1. **Full Flow**
   - Create document → scroll/zoom → save → reload → verify viewport restored
   - Create document → add elements → scroll/zoom → save → reload → verify both restored
   - Multiple documents → verify viewport state per document

2. **Edge Cases**
   - Extreme scroll positions (very large numbers)
   - Extreme zoom levels (0.1, 10.0)
   - Rapid scroll/zoom changes → verify debouncing works
   - Network failure during save → verify error handling

### Manual Testing Checklist

- [ ] Create new document → scroll → save → reload → verify scroll position restored
- [ ] Create new document → zoom in/out → save → reload → verify zoom level restored
- [ ] Create new document → scroll and zoom → save → reload → verify both restored
- [ ] Load old document (no viewport state) → verify no errors, defaults applied
- [ ] Load old document → scroll/zoom → save → verify viewport state added
- [ ] Multiple documents → verify each document remembers its own viewport
- [ ] Rapid scrolling → verify debouncing prevents excessive saves
- [ ] Verify `scrollToContent: false` prevents auto-scroll on load

---

## Performance Considerations

### Save Frequency
- **Viewport Saves**: Separate debounced 1000ms saves via `onScrollChange`
  - Only fires on scroll/zoom changes, not element changes
  - More efficient than extracting from `onChange`
- **Element Saves**: Separate debounced 1000ms saves via `onChange`
  - Only fires on element/background color changes
- **Impact**: Viewport changes trigger saves, but debouncing limits frequency
- **Benefit**: Separate callbacks prevent unnecessary saves when only one type changes

### Data Size
- **Additional Data**: ~50-100 bytes per document (viewport state)
- **Impact**: Negligible for JSONB storage
- **Scalability**: No concerns

### Network Traffic
- **Impact**: Slightly larger payloads on save
- **Mitigation**: Debouncing already limits save frequency

---

## Security Considerations

1. **Input Validation**: Viewport state is numeric - validate ranges if needed
2. **RLS Policies**: No changes needed (viewport state is part of document content)
3. **XSS**: No concerns (viewport state is numeric, not rendered as HTML)

---

## Future Enhancements (Out of Scope)

1. **Per-User Viewport State**: Store different viewport for each collaborator
2. **Viewport History**: Track viewport changes over time
3. **Smart Defaults**: Auto-center on content if no viewport state exists
4. **Viewport Animations**: Smooth transitions when restoring viewport
5. **Viewport Sharing**: Share viewport state in real-time collaboration
6. **Adaptive Debounce**: Adjust debounce timing based on change frequency

---

## Success Criteria

1. ✅ Viewport state (scroll, zoom) is saved to database
2. ✅ Viewport state is restored when loading documents
3. ✅ Backward compatibility maintained (old documents work)
4. ✅ No performance degradation
5. ✅ No breaking changes to existing functionality
6. ✅ All tests pass
7. ✅ User's view context preserved across sessions

---

## Implementation Notes

### Excalidraw Behavior
- Excalidraw will use `initialData.appState.scrollX`, `scrollY`, and `zoom` if provided
- Setting `scrollToContent: false` prevents automatic scroll-to-content behavior
- If viewport state is missing, Excalidraw will use defaults (typically center view)

### Debouncing Strategy
- Separate 1000ms debounce timers for viewport (`onScrollChange`) and elements (`onChange`)
- Viewport changes are frequent but not critical for immediate persistence
- Separate timers prevent conflicts and allow independent save frequencies
- Consider user experience: slight delay in viewport save is acceptable

### Data Structure
- Keep viewport state in `appState` object (consistent with Excalidraw API)
- Store only necessary properties (scroll, zoom) to minimize data size
- Use nullish coalescing for safe defaults

---

## Appendix: Example Data Structures

### Minimal Viewport State
```json
{
  "elements": [],
  "appState": {
    "scrollX": 0,
    "scrollY": 0,
    "zoom": {
      "value": 1.0,
      "offsetX": 0,
      "offsetY": 0
    }
  }
}
```

### With Background Color
```json
{
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "scrollX": 150,
    "scrollY": 200,
    "zoom": {
      "value": 1.5,
      "offsetX": 10,
      "offsetY": -5
    }
  }
}
```

### With Elements
```json
{
  "elements": [
    {
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 150
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "scrollX": 50,
    "scrollY": 75,
    "zoom": {
      "value": 2.0,
      "offsetX": 0,
      "offsetY": 0
    }
  }
}
```

