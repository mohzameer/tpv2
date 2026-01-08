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
  const excalidrawRef = useRef(null)
  const lastSavedContent = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()
  const { user } = useAuth()

  useEffect(() => {
    if (!docId) return
    loadContent()
  }, [docId, user]) // Reload when docId or user (auth state) changes

  useEffect(() => {
    // Cleanup viewport timeout on unmount
    return () => {
      if (viewportSaveTimeout.current) {
        clearTimeout(viewportSaveTimeout.current)
      }
    }
  }, [])

  async function loadContent() {
    try {
      const content = await getDocumentContent(docId)
      if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
        // Ensure appState has proper structure for backward compatibility
        const drawingContent = content.drawing_content
        if (!drawingContent.appState) {
          drawingContent.appState = {}
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
        
        setInitialData(drawingContent)
        lastSavedContent.current = JSON.stringify(drawingContent)
      } else {
        const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
        setViewportState(defaultViewport)
        
        const defaultData = {
          elements: [],
          appState: defaultViewport
        }
        setInitialData(defaultData)
        lastSavedContent.current = JSON.stringify(defaultData)
      }
    } catch (err) {
      console.error('Failed to load drawing:', err)
      const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
      setViewportState(defaultViewport)
      setInitialData({
        elements: [],
        appState: defaultViewport
      })
    }
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
    const currentContent = content?.drawing_content || { elements: [], appState: {} }
    
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
    
    const newContent = {
      elements: currentContent.elements || [],
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
    
    // Merge elements, background color, and viewport state
    const newContent = {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        scrollX: currentViewport.scrollX,
        scrollY: currentViewport.scrollY,
        zoom: currentViewport.zoom
      }
    }
    
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

  if (!initialData) {
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <Excalidraw
        key={`${docId}-${user?.id || 'guest'}`} // Force remount when docId or user changes
        ref={excalidrawRef}
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
