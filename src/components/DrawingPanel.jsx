import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useState, useEffect, useRef } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useAuth } from '../context/AuthContext'
import { Loader, Center } from '@mantine/core'

export default function DrawingPanel({ docId }) {
  const [initialData, setInitialData] = useState(null)
  const [viewportState, setViewportState] = useState({
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1.0, offsetX: 0, offsetY: 0 }
  })
  const saveTimeout = useRef(null)
  const viewportSaveTimeout = useRef(null)
  const excalidrawAPIRef = useRef(null)
  const lastSavedContent = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()
  const { user, loading: authLoading } = useAuth()
  const loadCountRef = useRef(0)
  const isLoadingRef = useRef(false)
  const loadedDocIdRef = useRef(null)
  const loadedUserIdRef = useRef(null)

  // Log component lifecycle
  useEffect(() => {
    console.log('[DrawingPanel] Component mounted', { docId, userId: user?.id, authLoading })
    return () => {
      console.log('[DrawingPanel] Component unmounted', { docId })
    }
  }, [])

  // Log user/auth changes
  useEffect(() => {
    console.log('[DrawingPanel] User/auth state changed', { 
      userId: user?.id, 
      userChanged: true,
      authLoading 
    })
  }, [user, authLoading])

  useEffect(() => {
    const userId = user?.id || null
    console.log('[DrawingPanel] useEffect triggered', { 
      docId, 
      userId, 
      authLoading,
      hasDocId: !!docId,
      isLoading: isLoadingRef.current,
      loadedDocId: loadedDocIdRef.current,
      loadedUserId: loadedUserIdRef.current,
      timestamp: Date.now()
    })
    
    if (!docId) {
      console.log('[DrawingPanel] Skipping loadContent - no docId')
      return
    }
    
    // Skip if already loading
    if (isLoadingRef.current) {
      console.log('[DrawingPanel] Skipping loadContent - already loading')
      return
    }
    
    // Skip if already loaded for this docId and userId combination
    if (loadedDocIdRef.current === docId && loadedUserIdRef.current === userId) {
      console.log('[DrawingPanel] Skipping loadContent - already loaded for this docId/userId')
      return
    }
    
    loadCountRef.current += 1
    const loadId = loadCountRef.current
    console.log(`[DrawingPanel] Calling loadContent #${loadId}`)
    loadContent(loadId)
  }, [docId, user?.id]) // Use user?.id instead of user to avoid reloads on object reference changes

  useEffect(() => {
    // Cleanup viewport timeout on unmount
    return () => {
      if (viewportSaveTimeout.current) {
        clearTimeout(viewportSaveTimeout.current)
      }
    }
  }, [])

  async function loadContent(loadId) {
    isLoadingRef.current = true
    const userId = user?.id || null
    console.log(`[DrawingPanel] loadContent #${loadId} started`, { docId, userId, timestamp: Date.now() })
    try {
      const content = await getDocumentContent(docId)
      console.log(`[DrawingPanel] loadContent #${loadId} - API response received`, { 
        hasDrawingContent: !!(content?.drawing_content && Object.keys(content.drawing_content).length > 0)
      })
      
      if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
        // Ensure appState has proper structure for backward compatibility
        const drawingContent = content.drawing_content
        if (!drawingContent.appState) {
          drawingContent.appState = {}
        }
        
        // Ensure files object exists (critical for image rendering)
        if (!drawingContent.files) {
          drawingContent.files = {}
        }
        
        // Set defaults for missing viewport properties
        const scrollX = drawingContent.appState.scrollX ?? 0
        const scrollY = drawingContent.appState.scrollY ?? 0
        const zoom = drawingContent.appState.zoom || { value: 1.0, offsetX: 0, offsetY: 0 }
        
        // Initialize viewport state from loaded content
        setViewportState({ scrollX, scrollY, zoom })
        
        // Ensure appState has all viewport properties
        drawingContent.appState = {
          ...drawingContent.appState,
          scrollX,
          scrollY,
          zoom
        }
        
        // Log file verification before setting initialData
        const imageElements = drawingContent.elements?.filter(e => e.type === 'image') || []
        const filesCount = Object.keys(drawingContent.files || {}).length
        console.log(`[DrawingPanel] loadContent #${loadId} - Loaded drawing_content`, {
          elements: drawingContent.elements?.length || 0,
          files: filesCount,
          imageElements: imageElements.length,
          allFilesPresent: imageElements.length === 0 || filesCount > 0
        })
        
        console.log(`[DrawingPanel] loadContent #${loadId} - Setting initialData (from saved content)`)
        setInitialData(drawingContent)
        lastSavedContent.current = JSON.stringify(drawingContent)
      } else {
        const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
        setViewportState(defaultViewport)
        
        const defaultData = {
          elements: [],
          files: {},
          appState: defaultViewport
        }
        console.log(`[DrawingPanel] loadContent #${loadId} - Setting initialData (default/empty)`)
        setInitialData(defaultData)
        lastSavedContent.current = JSON.stringify(defaultData)
      }
      
      // Mark as loaded for this docId/userId combination
      loadedDocIdRef.current = docId
      loadedUserIdRef.current = userId
      console.log(`[DrawingPanel] loadContent #${loadId} - Completed successfully`)
    } catch (err) {
      console.error(`[DrawingPanel] loadContent #${loadId} - Failed:`, err)
      const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
      setViewportState(defaultViewport)
      console.log(`[DrawingPanel] loadContent #${loadId} - Setting initialData (error fallback)`)
      setInitialData({
        elements: [],
        files: {},
        appState: defaultViewport
      })
      // Still mark as loaded even on error to prevent retry loops
      loadedDocIdRef.current = docId
      loadedUserIdRef.current = userId
    } finally {
      isLoadingRef.current = false
    }
  }

  function handleExcalidrawAPI(api) {
    excalidrawAPIRef.current = api
  }

  function handleChange(elements, appState) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveContent(elements, appState)
    }, 1000)
  }

  function handleScrollChange(scrollX, scrollY, zoom) {
    // Update local state immediately for UI responsiveness
    setViewportState({ scrollX, scrollY, zoom })
    
    // Debounce save to database
    if (viewportSaveTimeout.current) clearTimeout(viewportSaveTimeout.current)
    viewportSaveTimeout.current = setTimeout(() => {
      saveViewportState(scrollX, scrollY, zoom)
    }, 1000)
  }

  async function saveViewportState(scrollX, scrollY, zoom) {
    if (!docId) return
    
    // Get current content to merge viewport state
    const content = await getDocumentContent(docId)
    const currentContent = content?.drawing_content || { elements: [], files: {}, appState: {} }
    
    // Merge viewport state with existing appState
    const updatedAppState = {
      ...currentContent.appState,
      scrollX: scrollX ?? 0,
      scrollY: scrollY ?? 0,
      zoom: zoom ? {
        value: zoom.value ?? 1.0,
        offsetX: zoom.offsetX ?? 0,
        offsetY: zoom.offsetY ?? 0
      } : { value: 1.0, offsetX: 0, offsetY: 0 }
    }
    
    // Preserve files when saving viewport state (critical!)
    const newContent = {
      elements: currentContent.elements || [],
      files: currentContent.files || {},
      appState: updatedAppState
    }
    
    const contentString = JSON.stringify(newContent)
    if (contentString === lastSavedContent.current) return
    
    try {
      setIsSyncing(true)
      await updateDocumentContent(docId, { drawing_content: newContent })
      lastSavedContent.current = contentString
    } catch (err) {
      console.error('Failed to save viewport state:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  async function saveContent(elements, appState) {
    if (!docId) return
    
    // Get current viewport state from local state
    const currentViewport = viewportState
    
    // Get files from Excalidraw API (CRITICAL for image persistence)
    let files = {}
    if (excalidrawAPIRef.current) {
      try {
        files = excalidrawAPIRef.current.getFiles()
      } catch (err) {
        console.warn('Failed to get files from Excalidraw API:', err)
      }
    }
    
    // Merge elements, files, background color, and viewport state
    const newContent = {
      elements,
      files, // MUST include files for images to render correctly
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        scrollX: currentViewport.scrollX,
        scrollY: currentViewport.scrollY,
        zoom: currentViewport.zoom
      }
    }
    
    // Log verification before saving
    const imageElements = elements.filter(e => e.type === 'image')
    const filesCount = Object.keys(files).length
    console.log('[DrawingPanel] saveContent - Verification before save:', {
      elements: elements.length,
      filesCount,
      imageElements: imageElements.length,
      allFilesPresent: imageElements.length === 0 || filesCount > 0
    })
    
    const currentContent = JSON.stringify(newContent)
    if (currentContent === lastSavedContent.current) return
    
    try {
      setIsSyncing(true)
      await updateDocumentContent(docId, { drawing_content: newContent })
      lastSavedContent.current = currentContent
    } catch (err) {
      console.error('Failed to save drawing:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  // Log render state
  useEffect(() => {
    console.log('[DrawingPanel] Render state changed', { 
      hasInitialData: !!initialData,
      showingLoader: !initialData,
      timestamp: Date.now()
    })
  }, [initialData])

  if (!initialData) {
    console.log('[DrawingPanel] Rendering LOADER')
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }

  const excalidrawKey = `${docId}-${user?.id || 'guest'}`
  
  // Log verification before rendering
  const imageElements = initialData?.elements?.filter(e => e.type === 'image') || []
  const filesCount = Object.keys(initialData?.files || {}).length
  console.log('[DrawingPanel] Rendering EXCALIDRAW', { 
    excalidrawKey,
    hasInitialData: !!initialData,
    elements: initialData?.elements?.length || 0,
    files: filesCount,
    imageElements: imageElements.length,
    allFilesPresent: imageElements.length === 0 || filesCount > 0,
    timestamp: Date.now()
  })

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <Excalidraw
        key={excalidrawKey} // Force remount when docId or user changes
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          ...initialData,
          scrollToContent: false  // Prevent auto-scroll, use saved scroll position
        }}
        zenModeEnabled={true}
        onChange={handleChange}  // Handles elements and background color
        onScrollChange={handleScrollChange}  // Handles viewport state (scroll/zoom)
        theme={colorScheme}
      />
    </div>
  )
}
