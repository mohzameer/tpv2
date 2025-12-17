import { useParams, useOutletContext } from 'react-router-dom'
import WorkspacePanel from '../components/WorkspacePanel'

export default function DocumentPage() {
  const { projectId, docId } = useParams()
  const { mode } = useOutletContext()

  return <WorkspacePanel mode={mode} projectId={projectId} docId={docId} />
}
