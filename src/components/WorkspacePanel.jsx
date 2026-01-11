import { useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'

export default function WorkspacePanel({ 
  mode, 
  layoutRatio, 
  onRatioChange, 
  notesPanelSize, 
  drawingPanelSize, 
  onPanelSizeChange,
  projectId, 
  docId 
}) {
  const notesPanelRef = useRef(null)
  const drawingPanelRef = useRef(null)
  const isResizingRef = useRef(false)

  // Calculate initial panel sizes based on mode and saved sizes
  // Use 0.1% instead of 0% so components can still receive events
  const getInitialNotesSize = () => {
    if (mode === 'notes') return 100
    if (mode === 'drawing') return 0.1 // Minimal size to keep component active
    // 'both' mode - ensure layoutRatio is valid (between 20 and 80)
    const validRatio = Math.max(20, Math.min(80, layoutRatio || 50))
    return validRatio
  }

  const getInitialDrawingSize = () => {
    if (mode === 'notes') return 0.1 // Minimal size to keep component active
    if (mode === 'drawing') return 100
    // 'both' mode - ensure layoutRatio is valid
    const validRatio = Math.max(20, Math.min(80, layoutRatio || 50))
    return 100 - validRatio
  }

  // Update panel sizes when mode or layoutRatio changes
  useEffect(() => {
    if (notesPanelRef.current && drawingPanelRef.current && !isResizingRef.current) {
      if (mode === 'notes') {
        notesPanelRef.current.resize(100)
        drawingPanelRef.current.resize(0.1) // Minimal size to keep component active
      } else if (mode === 'drawing') {
        notesPanelRef.current.resize(0.1) // Minimal size to keep component active
        drawingPanelRef.current.resize(100)
      } else {
        // 'both' mode - use layoutRatio, but ensure it's valid
        const validRatio = Math.max(20, Math.min(80, layoutRatio || 50))
        notesPanelRef.current.resize(validRatio)
        drawingPanelRef.current.resize(100 - validRatio)
      }
    }
  }, [mode, layoutRatio])

  // Always render both panels to keep them mounted
  return (
    <PanelGroup 
      direction="horizontal" 
      style={{ height: '100%' }}
      onLayout={(sizes) => {
        if (mode === 'both' && !isResizingRef.current) {
          isResizingRef.current = true
          // Save the ratio for 'both' mode, but only if it's valid (between 20 and 80)
          const newRatio = sizes[0]
          if (newRatio >= 20 && newRatio <= 80 && newRatio !== layoutRatio) {
            onRatioChange(newRatio)
          }
          // Reset flag after a short delay
          setTimeout(() => {
            isResizingRef.current = false
          }, 100)
        }
      }}
    >
      <Panel 
        ref={notesPanelRef}
        defaultSize={getInitialNotesSize()} 
        minSize={mode === 'drawing' ? 0.1 : 20}
        maxSize={mode === 'drawing' ? 0.1 : 100}
        collapsible={false}
      >
        <div style={{ 
          width: '100%', 
          height: '100%',
          overflow: 'hidden',
          visibility: mode === 'drawing' ? 'hidden' : 'visible',
          position: 'relative'
        }}>
          <NotesPanel key={`notes-${docId}`} docId={docId} />
        </div>
      </Panel>
      {mode === 'both' && (
        <PanelResizeHandle 
          style={{ 
            width: 4, 
            background: 'var(--mantine-color-gray-3)',
            cursor: 'col-resize'
          }} 
        />
      )}
      <Panel 
        ref={drawingPanelRef}
        defaultSize={getInitialDrawingSize()} 
        minSize={mode === 'notes' ? 0.1 : 20}
        maxSize={mode === 'notes' ? 0.1 : 100}
        collapsible={false}
      >
        <div style={{ 
          width: '100%', 
          height: '100%',
          overflow: 'hidden',
          visibility: mode === 'notes' ? 'hidden' : 'visible',
          position: 'relative'
        }}>
          <DrawingPanel key={`drawing-${docId}`} docId={docId} />
        </div>
      </Panel>
    </PanelGroup>
  )
}
