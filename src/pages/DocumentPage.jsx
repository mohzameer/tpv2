import { useParams, useOutletContext } from 'react-router-dom'
import WorkspacePanel from '../components/WorkspacePanel'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useProjectContext } from '../context/ProjectContext'
import { Loader, Center } from '@mantine/core'

export default function DocumentPage() {
  const { projectId, docId } = useParams()
  const { mode, setMode } = useOutletContext()
  const [layoutRatio, setLayoutRatio] = useState(50)
  const [loaded, setLoaded] = useState(false)
  const saveTimeout = useRef(null)
  const docIdRef = useRef(docId)
  const { user, loading: authLoading } = useAuth()
  const { project, switchProject, loading: projectLoading } = useProjectContext()
  const navigatingRef = useRef(false)
  const lastProjectIdRef = useRef(projectId)

  // Keep docIdRef in sync
  useEffect(() => {
    docIdRef.current = docId
  }, [docId])


  // Track when projectId changes (navigation happening)
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      navigatingRef.current = true
      lastProjectIdRef.current = projectId
      // Clear the navigating flag after navigation completes
      setTimeout(() => {
        navigatingRef.current = false
      }, 300)
    }
  }, [projectId])

  // Sync project with URL projectId - ensure the project in context matches the URL
  // Add a small delay to prevent race conditions when switching projects
  useEffect(() => {
    if (!projectId || projectLoading) {
      return
    }
    
    // Don't sync if we're in the middle of navigation - wait for it to complete
    if (navigatingRef.current) {
      return
    }
    
    // If project is already correct, no need to switch
    if (project && project.id === projectId) {
      return
    }
    
    // Add a small delay to allow switchProject to complete if it was just called
    const timer = setTimeout(() => {
      // Check again if we're still navigating
      if (navigatingRef.current) {
        return
      }
      
      if (project && project.id !== projectId && !projectLoading) {
        switchProject(projectId)
      }
    }, 200)
    
    return () => clearTimeout(timer)
  }, [projectId, project, switchProject, projectLoading])

  useEffect(() => {
    if (!docId) {
      return
    }
    
    // Wait for auth to be ready before loading (prevents loading wrong doc during login)
    if (authLoading) {
      return
    }
    
    // Clear any pending saves from previous doc
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
    }
    
    // Small delay to allow navigation to complete after login
    // This prevents loading the wrong document if user just logged in
    const timer = setTimeout(() => {
      loadLayout()
    }, 150)
    
    return () => {
      clearTimeout(timer)
    }
  }, [docId, user, authLoading]) // Reload when docId, user (auth state), or authLoading changes

  const handleModeChangeFromHeader = useCallback((newMode) => {
    setMode(newMode)
    setLayoutRatio(50)
    saveLayout(newMode, 50, docIdRef.current)
  }, [setMode])

  useEffect(() => {
    function handleHeaderModeChange(e) {
      handleModeChangeFromHeader(e.detail)
    }
    window.addEventListener('modeChange', handleHeaderModeChange)
    return () => window.removeEventListener('modeChange', handleHeaderModeChange)
  }, [handleModeChangeFromHeader])

  async function loadLayout() {
    setLoaded(false)
    try {
      const content = await getDocumentContent(docId)
      if (content?.layout_mode) {
        setMode(content.layout_mode)
      }
      if (content?.layout_ratio) {
        setLayoutRatio(content.layout_ratio)
      }
    } catch (err) {
      console.error('[DocumentPage] loadLayout - Failed:', err)
    } finally {
      setLoaded(true)
    }
  }

  function handleModeChange(newMode) {
    setMode(newMode)
    setLayoutRatio(50) // Reset ratio when mode changes
    saveLayout(newMode, 50, docIdRef.current)
  }

  function handleRatioChange(ratio) {
    setLayoutRatio(ratio)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const currentDocId = docIdRef.current
    saveTimeout.current = setTimeout(() => {
      saveLayout(mode, ratio, currentDocId)
    }, 500)
  }

  async function saveLayout(layoutMode, ratio, targetDocId) {
    if (!targetDocId) return
    try {
      await updateDocumentContent(targetDocId, { layout_mode: layoutMode, layout_ratio: ratio })
    } catch (err) {
      console.error('Failed to save layout:', err)
    }
  }

  if (!loaded) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }
  return (
    <WorkspacePanel 
      mode={mode} 
      onModeChange={handleModeChange}
      layoutRatio={layoutRatio}
      onRatioChange={handleRatioChange}
      projectId={projectId} 
      docId={docId} 
    />
  )
}
