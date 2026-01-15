import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { getUserLastVisited, getProjects, getDocuments } from '../lib/api'
import { getLastDocumentNumberForProject } from '../lib/lastVisited'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { project, documents, loading } = useProjectContext()
  const { user, loading: authLoading } = useAuth()
  const hasNavigatedRef = useRef(false)

  useEffect(() => {
    // Only run if we're on the home page and haven't navigated yet
    if (location.pathname !== '/' || hasNavigatedRef.current) {
      return
    }

    async function navigateToDocument() {
      // First, check if user is logged in (don't wait for ProjectContext for logged-in users)
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user

      if (currentUser) {
        // Logged-in user: get last visited FIRST, then navigate
        // Don't wait for ProjectContext - it might be loading guest projects
        
        // Get last visited FIRST (sequential)
        const lastVisited = await getUserLastVisited()
        
        // Then get projects
        const projects = await getProjects()
        
        // Navigate to last visited if it exists and is valid
        if (lastVisited?.projectId && projects.length > 0) {
          const project = projects.find(p => p.id === lastVisited.projectId)
          if (project) {
            const docs = await getDocuments(project.id)
            
            // Try to find by document number
            const lastDocNumber = getLastDocumentNumberForProject(project.id)
            if (lastDocNumber) {
              const doc = docs.find(d => d.document_number === lastDocNumber)
              if (doc && doc.document_number) {
                hasNavigatedRef.current = true
                navigate(`/${project.id}/${doc.document_number}`, { replace: true })
                return
              }
            }
            
            // If not found, use first document
            if (docs.length > 0 && docs[0].document_number) {
              hasNavigatedRef.current = true
              navigate(`/${project.id}/${docs[0].document_number}`, { replace: true })
              return
            }
          }
        }
        
        // Fallback: first project's first doc
        if (projects.length > 0) {
          const firstProject = projects[0]
          const docs = await getDocuments(firstProject.id)
          if (docs.length > 0 && docs[0].document_number) {
            hasNavigatedRef.current = true
            navigate(`/${firstProject.id}/${docs[0].document_number}`, { replace: true })
            return
          }
        }
      } else {
        // Guest user: wait for ProjectContext to load, then navigate to first project's first document
        if (loading || authLoading) {
          return
        }
        if (project && documents.length > 0 && documents[0].document_number) {
          hasNavigatedRef.current = true
          navigate(`/${project.id}/${documents[0].document_number}`, { replace: true })
        }
      }
    }

    navigateToDocument()
  }, [loading, authLoading, project, documents, navigate, location.pathname])

  return (
    <Center h="100%">
      <Loader />
    </Center>
  )
}
