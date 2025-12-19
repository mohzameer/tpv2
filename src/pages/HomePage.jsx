import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Center, Loader } from '@mantine/core'
import { getLastVisited } from '../lib/lastVisited'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'
import { hasEverLoggedIn } from '../lib/guest'

export default function HomePage() {
  const navigate = useNavigate()
  const { project, documents, loading, error } = useProjectContext()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    console.log('[HomePage] useEffect triggered:', {
      authLoading,
      user: user?.id || 'none',
      loading,
      error: error?.message || 'none',
      project: project?.id || 'none',
      documentsCount: documents.length
    })

    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[HomePage] Waiting for auth to load...')
      return
    }

    // If user has logged in before but is not currently logged in, redirect to login
    const hasLoggedIn = hasEverLoggedIn()
    if (hasLoggedIn && !user) {
      console.log('[HomePage] User has logged in before but is not logged in - redirecting to login')
      navigate('/login', { replace: true })
      return
    }

    // If there's an error (e.g., user needs to login), redirect to login
    if (error) {
      const errorMessage = error.message || String(error)
      console.log('[HomePage] Error detected:', errorMessage)
      if (errorMessage.includes('must be logged in') || 
          errorMessage.includes('login') ||
          errorMessage.includes('logged in')) {
        console.log('[HomePage] Authentication error - redirecting to login')
        navigate('/login', { replace: true })
        return
      }
    }

    if (loading) {
      console.log('[HomePage] Still loading projects...')
      return
    }

    const lastVisited = getLastVisited()
    console.log('[HomePage] Last visited:', lastVisited)
    
    if (lastVisited?.projectId && lastVisited?.docId) {
      console.log('[HomePage] Navigating to last visited:', `/${lastVisited.projectId}/${lastVisited.docId}`)
      navigate(`/${lastVisited.projectId}/${lastVisited.docId}`, { replace: true })
    } else if (project && documents.length > 0) {
      console.log('[HomePage] Navigating to first document:', `/${project.id}/${documents[0].id}`)
      navigate(`/${project.id}/${documents[0].id}`, { replace: true })
    } else {
      console.log('[HomePage] No project or documents available - staying on home page')
    }
  }, [loading, project, documents, error, navigate, user, authLoading])

  return (
    <Center h="100%">
      <Loader />
    </Center>
  )
}
