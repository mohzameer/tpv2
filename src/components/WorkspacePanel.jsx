import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'

export default function WorkspacePanel({ mode, layoutRatio, onRatioChange, projectId, docId }) {
  useEffect(() => {
    console.log('[WorkspacePanel] Component mounted/updated', { mode, docId, timestamp: Date.now() })
    return () => {
      console.log('[WorkspacePanel] Component unmounted', { mode, docId })
    }
  }, [mode, docId])

  if (mode === 'notes') {
    console.log('[WorkspacePanel] Rendering NotesPanel only')
    return <NotesPanel key={docId} docId={docId} />
  }

  if (mode === 'drawing') {
    console.log('[WorkspacePanel] Rendering DrawingPanel only')
    return <DrawingPanel key={docId} docId={docId} />
  }

  // Both mode - resizable split
  console.log('[WorkspacePanel] Rendering both panels (split mode)')
  return (
    <PanelGroup 
      direction="horizontal" 
      style={{ height: '100%' }}
      onLayout={(sizes) => {
        if (sizes[0] !== layoutRatio) {
          onRatioChange(sizes[0])
        }
      }}
    >
      <Panel defaultSize={layoutRatio} minSize={20}>
        <NotesPanel key={`notes-${docId}`} docId={docId} />
      </Panel>
      <PanelResizeHandle style={{ 
        width: 4, 
        background: 'var(--mantine-color-gray-3)',
        cursor: 'col-resize'
      }} />
      <Panel defaultSize={100 - layoutRatio} minSize={20}>
        <DrawingPanel key={`drawing-${docId}`} docId={docId} />
      </Panel>
    </PanelGroup>
  )
}
