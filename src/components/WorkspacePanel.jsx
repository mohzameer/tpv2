import { useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'

export default function WorkspacePanel({ mode, layoutRatio, onRatioChange, projectId, docId }) {
  const notesPanelRef = useRef(null)
  const drawingPanelRef = useRef(null)
  const isResizingRef = useRef(false)

  // Calculate initial panel sizes based on mode
  const getInitialNotesSize = () => {
    if (mode === 'notes') return 100
    if (mode === 'drawing') return 0
    return layoutRatio // 'both' mode
  }

  const getInitialDrawingSize = () => {
    if (mode === 'notes') return 0
    if (mode === 'drawing') return 100
    return 100 - layoutRatio // 'both' mode
  }

  // Update panel sizes when mode or layoutRatio changes
  useEffect(() => {
    if (notesPanelRef.current && drawingPanelRef.current && !isResizingRef.current) {
      if (mode === 'notes') {
        notesPanelRef.current.resize(100)
        drawingPanelRef.current.resize(0)
      } else if (mode === 'drawing') {
        notesPanelRef.current.resize(0)
        drawingPanelRef.current.resize(100)
      } else {
        // 'both' mode - use layoutRatio
        notesPanelRef.current.resize(layoutRatio)
        drawingPanelRef.current.resize(100 - layoutRatio)
      }
    }
  }, [mode, layoutRatio])

  // Always render both panels to keep them mounted
  return (
    <PanelGroup 
      direction="horizontal" 
      style={{ height: '100%' }}
      onLayout={(sizes) => {
        if (mode === 'both' && sizes[0] !== layoutRatio && !isResizingRef.current) {
          isResizingRef.current = true
          onRatioChange(sizes[0])
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
        minSize={mode === 'drawing' ? 0 : 20}
        maxSize={mode === 'drawing' ? 0 : 100}
        collapsible={false}
      >
        <NotesPanel key={`notes-${docId}`} docId={docId} />
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
        minSize={mode === 'notes' ? 0 : 20}
        maxSize={mode === 'notes' ? 0 : 100}
        collapsible={false}
      >
        <DrawingPanel key={`drawing-${docId}`} docId={docId} />
      </Panel>
    </PanelGroup>
  )
}
