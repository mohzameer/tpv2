import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import NotesPanel from './NotesPanel'
import DrawingPanel from './DrawingPanel'
import { useProjectContext } from '../context/ProjectContext'
import { canEditText, canEditDrawing } from '../lib/permissions'

export default function WorkspacePanel({ mode, layoutRatio, onRatioChange, projectId, docId }) {
  const { userRole, membersLoading } = useProjectContext()
  // Only restrict editing if we have a confirmed role
  // Default to editable (undefined) while loading to prevent banner flashing
  // Components will handle undefined as "not yet determined" and default to editable
  const textEditable = (userRole === null || userRole === undefined || membersLoading) 
    ? undefined 
    : canEditText(userRole)
  const drawingEditable = (userRole === null || userRole === undefined || membersLoading)
    ? undefined
    : canEditDrawing(userRole)

  if (mode === 'notes') {
    return <NotesPanel key={docId} docId={docId} editable={textEditable} />
  }

  if (mode === 'drawing') {
    return <DrawingPanel key={docId} docId={docId} editable={drawingEditable} />
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
        <NotesPanel key={`notes-${docId}`} docId={docId} editable={textEditable} />
      </Panel>
      <PanelResizeHandle style={{ 
        width: 4, 
        background: 'var(--mantine-color-gray-3)',
        cursor: 'col-resize'
      }} />
      <Panel defaultSize={100 - layoutRatio} minSize={20}>
        <DrawingPanel key={`drawing-${docId}`} docId={docId} editable={drawingEditable} />
      </Panel>
    </PanelGroup>
  )
}
