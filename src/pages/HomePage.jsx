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
  const { project, loading } = useProjectContext()
  const { loading: authLoading } = useAuth()
  const hasNavigatedRef = useRef(false)
  const projectRef = useRef(project)
  const loadingRef = useRef(loading)
  const authLoadingRef = useRef(authLoading)
  const pathnameRef = useRef(location.pathname)

  useEffect(() => {
    projectRef.current = project
    loadingRef.current = loading
    authLoadingRef.current = authLoading
    pathnameRef.current = location.pathname
  }, [project, loading, authLoading, location.pathname])

  useEffect(() => {
    if (location.pathname !== '/') {
      hasNavigatedRef.current = false
      return
    }

    let cancelled = false

    async function navigateToDocument() {
      // First, check if user is logged in (don't wait for ProjectContext for logged-in users)
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || pathnameRef.current !== '/') return

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
              if (doc && doc.document_number != null) {
                hasNavigatedRef.current = true
                navigate(`/${project.id}/${doc.document_number}`, { replace: true })
                return
              }
            }
            
            // If not found, use first document
            if (docs.length > 0 && docs[0].document_number != null) {
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
          if (docs.length > 0 && docs[0].document_number != null) {
            hasNavigatedRef.current = true
            navigate(`/${firstProject.id}/${docs[0].document_number}`, { replace: true })
            return
          }
        }
      } else {
        // Guest: read loading/auth/project AFTER await via refs (closure would be stale vs getSession)
        if (loadingRef.current || authLoadingRef.current) {
          return
        }
        const proj = projectRef.current
        if (!proj?.id) {
          return
        }
        const docs = await getDocuments(proj.id)
        if (cancelled || pathnameRef.current !== '/') return
        const docNum = docs[0]?.document_number
        if (docs.length > 0 && docNum != null) {
          hasNavigatedRef.current = true
          navigate(`/${proj.id}/${docNum}`, { replace: true })
        }
      }
    }

    navigateToDocument()
    return () => {
      cancelled = true
    }
  }, [loading, authLoading, project, navigate, location.pathname])

  return (
    <Center h="100%">
      <Loader />
    </Center>
  )
}
