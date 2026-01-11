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
  const [notesPanelSize, setNotesPanelSize] = useState(100) // Size when in notes mode
  const [drawingPanelSize, setDrawingPanelSize] = useState(100) // Size when in drawing mode
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
    // Force save any pending changes before switching modes
    // Dispatch event to trigger save in DrawingPanel and NotesPanel
    window.dispatchEvent(new CustomEvent('forceSaveBeforeModeChange', { detail: { newMode } }))
    
    // Small delay to allow saves to complete, then save the mode change
    setTimeout(() => {
      const currentDocId = docIdRef.current
      // Update mode first
      setMode(newMode)
      
      // For 'both' mode, ensure layoutRatio is valid (between 20 and 80)
      // For single-panel modes, we don't need to save layoutRatio
      let ratioToSave = layoutRatio
      if (newMode === 'both') {
        // Ensure ratio is valid (between 20 and 80)
        if (ratioToSave < 20) ratioToSave = 50
        if (ratioToSave > 80) ratioToSave = 50
      }
      
      saveLayout(newMode, ratioToSave, notesPanelSize, drawingPanelSize, currentDocId)
      console.log('[DocumentPage] Saving mode change:', newMode, { ratio: ratioToSave })
    }, 200)
  }, [setMode, layoutRatio, notesPanelSize, drawingPanelSize])

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
      console.log('[DocumentPage] Loading layout from database:', { 
        layout_mode: content?.layout_mode,
        layout_ratio: content?.layout_ratio 
      })
      
      if (content?.layout_mode) {
        console.log('[DocumentPage] Setting mode to:', content.layout_mode)
        setMode(content.layout_mode)
      } else {
        console.log('[DocumentPage] No saved mode, using default')
      }
      
      if (content?.layout_ratio !== undefined) {
        // Ensure layout_ratio is valid (between 20 and 80)
        let ratio = content.layout_ratio
        if (ratio < 20 || ratio > 80) {
          console.warn('[DocumentPage] Invalid layout_ratio:', ratio, 'resetting to 50')
          ratio = 50
        }
        setLayoutRatio(ratio)
      }
      // Load saved panel sizes for each mode
      if (content?.notes_panel_size !== undefined) {
        setNotesPanelSize(content.notes_panel_size)
      }
      if (content?.drawing_panel_size !== undefined) {
        setDrawingPanelSize(content.drawing_panel_size)
      }
    } catch (err) {
      console.error('[DocumentPage] loadLayout - Failed:', err)
    } finally {
      setLoaded(true)
    }
  }

  function handleModeChange(newMode) {
    console.log('[DocumentPage] handleModeChange called:', newMode)
    setMode(newMode)
    // Don't reset ratio - keep the saved size for the mode
    // For 'both' mode, ensure layoutRatio is valid
    let ratioToSave = layoutRatio
    if (newMode === 'both') {
      if (ratioToSave < 20 || ratioToSave > 80) {
        ratioToSave = 50
      }
    }
    saveLayout(newMode, ratioToSave, notesPanelSize, drawingPanelSize, docIdRef.current)
  }

  function handleRatioChange(ratio) {
    // Only update ratio if it's valid (between 20 and 80)
    if (ratio >= 20 && ratio <= 80) {
      setLayoutRatio(ratio)
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      const currentDocId = docIdRef.current
      saveTimeout.current = setTimeout(() => {
        // Only save if mode is 'both'
        if (mode === 'both') {
          saveLayout(mode, ratio, notesPanelSize, drawingPanelSize, currentDocId)
        }
      }, 500)
    }
  }

  function handlePanelSizeChange(notesSize, drawingSize) {
    setNotesPanelSize(notesSize)
    setDrawingPanelSize(drawingSize)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const currentDocId = docIdRef.current
    saveTimeout.current = setTimeout(() => {
      saveLayout(mode, layoutRatio, notesSize, drawingSize, currentDocId)
    }, 500)
  }

  async function saveLayout(layoutMode, ratio, notesSize, drawingSize, targetDocId) {
    if (!targetDocId) {
      console.warn('[DocumentPage] Cannot save layout: no docId')
      return
    }
    try {
      // Only save layout_ratio if mode is 'both' and ratio is valid (20-80)
      // Don't save invalid ratios (like 0.1 from hidden panels)
      const ratioToSave = (layoutMode === 'both' && ratio >= 20 && ratio <= 80) ? ratio : undefined
      
      console.log('[DocumentPage] Saving layout:', { layoutMode, ratio: ratioToSave, notesSize, drawingSize, targetDocId })
      
      const updates = { layout_mode: layoutMode }
      if (ratioToSave !== undefined) {
        updates.layout_ratio = ratioToSave
      }
      if (notesSize !== undefined) {
        updates.notes_panel_size = notesSize
      }
      if (drawingSize !== undefined) {
        updates.drawing_panel_size = drawingSize
      }
      
      await updateDocumentContent(targetDocId, updates)
      console.log('[DocumentPage] ✅ Layout saved successfully')
    } catch (err) {
      console.error('[DocumentPage] ❌ Failed to save layout:', err)
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
      notesPanelSize={notesPanelSize}
      drawingPanelSize={drawingPanelSize}
      onPanelSizeChange={handlePanelSizeChange}
      projectId={projectId} 
      docId={docId} 
    />
  )
}
