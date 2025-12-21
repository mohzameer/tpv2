import { Center, Text } from '@mantine/core'
import { useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useProjectContext } from '../context/ProjectContext'

export default function ProjectPage() {
  const { projectId } = useParams()
  const { project, switchProject, loading } = useProjectContext()

  // Sync project with URL projectId - ensure the project in context matches the URL
  // Add a small delay to prevent race conditions when switching projects
  useEffect(() => {
    if (!projectId || loading) return
    
    // If project is already correct, no need to switch
    if (project && project.id === projectId) return
    
    // Add a small delay to allow switchProject to complete if it was just called
    const timer = setTimeout(() => {
      if (project && project.id !== projectId && !loading) {
        switchProject(projectId)
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [projectId, project, switchProject, loading])

  return (
    <Center h="100%">
      <Text c="dimmed">Project: {projectId} – Select a document</Text>
    </Center>
  )
}
