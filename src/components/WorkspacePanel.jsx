import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'

export default function WorkspacePanel({ mode, layoutRatio, onRatioChange, projectId, docId }) {
  if (mode === 'notes') {
    return <NotesPanel key={docId} docId={docId} />
  }

  if (mode === 'drawing') {
    return <DrawingPanel key={docId} docId={docId} />
  }

  // Both mode - resizable split
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
