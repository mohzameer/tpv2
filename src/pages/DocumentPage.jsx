import { useParams, useOutletContext } from 'react-router-dom'
import WorkspacePanel from '../components/WorkspacePanel'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'

export default function DocumentPage() {
  const { projectId, docId } = useParams()
  const { mode, setMode } = useOutletContext()
  const [layoutRatio, setLayoutRatio] = useState(50)
  const [loaded, setLoaded] = useState(false)
  const saveTimeout = useRef(null)
  const docIdRef = useRef(docId)

  // Keep docIdRef in sync
  useEffect(() => {
    docIdRef.current = docId
  }, [docId])

  useEffect(() => {
    if (!docId) return
    // Clear any pending saves from previous doc
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
    }
    loadLayout()
  }, [docId])

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
      console.log('Loading layout for docId:', docId)
      const content = await getDocumentContent(docId)
      console.log('Loaded content:', content)
      if (content?.layout_mode) {
        setMode(content.layout_mode)
      }
      if (content?.layout_ratio) {
        setLayoutRatio(content.layout_ratio)
      }
    } catch (err) {
      console.error('Failed to load layout:', err)
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
      console.log('Saving layout for docId:', targetDocId, 'mode:', layoutMode, 'ratio:', ratio)
      await updateDocumentContent(targetDocId, { layout_mode: layoutMode, layout_ratio: ratio })
    } catch (err) {
      console.error('Failed to save layout:', err)
    }
  }

  if (!loaded) return null

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
