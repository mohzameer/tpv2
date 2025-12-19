import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { getLastVisited } from '../lib/lastVisited'
import { useProjectContext } from '../context/ProjectContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { project, documents, loading } = useProjectContext()

  useEffect(() => {
    if (loading) return

    const lastVisited = getLastVisited()
    
    if (lastVisited?.projectId && lastVisited?.docId) {
      navigate(`/app/${lastVisited.projectId}/${lastVisited.docId}`, { replace: true })
    } else if (project && documents.length > 0) {
      navigate(`/app/${project.id}/${documents[0].id}`, { replace: true })
    }
  }, [loading, project, documents, navigate])

  return (
    <Center h="100%">
      <Loader />
    </Center>
  )
}
