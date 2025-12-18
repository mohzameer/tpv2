import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'
import { useMemo } from 'react'

export default function WorkspacePanel({ mode, layoutRatio, onRatioChange, projectId, docId }) {
  // Memoize panels so they only re-render when docId changes, not when mode changes
  // Key is based only on docId, so React keeps them mounted when mode changes
  const notesPanel = useMemo(() => <NotesPanel docId={docId} />, [docId])
  const drawingPanel = useMemo(() => <DrawingPanel docId={docId} />, [docId])

  // Always use PanelGroup structure to keep panels mounted
  // For single-panel modes, we'll hide one panel but keep it in the DOM
  const showResizeHandle = mode === 'both'
  
  // Calculate sizes - when hidden, set to 0 but keep minSize at 0
  const getNotesSize = () => {
    if (mode === 'notes') return 100
    if (mode === 'both') return layoutRatio
    return 0
  }
  
  const getDrawingSize = () => {
    if (mode === 'drawing') return 100
    if (mode === 'both') return 100 - layoutRatio
    return 0
  }

  return (
    <PanelGroup 
      direction="horizontal" 
      style={{ height: '100%' }}
      onLayout={(sizes) => {
        if (mode === 'both' && sizes[0] !== layoutRatio) {
          onRatioChange(sizes[0])
        }
      }}
    >
      <Panel 
        defaultSize={getNotesSize()}
        minSize={mode === 'notes' || mode === 'both' ? 20 : 0}
        collapsible={mode !== 'both'}
        collapsedSize={mode === 'drawing' ? 0 : undefined}
      >
        <div style={{ 
          height: '100%', 
          width: '100%',
          display: mode === 'drawing' ? 'none' : 'block'
        }}>
          {notesPanel}
        </div>
      </Panel>
      {showResizeHandle && (
        <PanelResizeHandle style={{ 
          width: 4, 
          background: 'var(--mantine-color-gray-3)',
          cursor: 'col-resize'
        }} />
      )}
      <Panel 
        defaultSize={getDrawingSize()}
        minSize={mode === 'drawing' || mode === 'both' ? 20 : 0}
        collapsible={mode !== 'both'}
        collapsedSize={mode === 'notes' ? 0 : undefined}
      >
        <div style={{ 
          height: '100%', 
          width: '100%',
          display: mode === 'notes' ? 'none' : 'block'
        }}>
          {drawingPanel}
        </div>
      </Panel>
    </PanelGroup>
  )
}
