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
  const filesVerifiedRef = useRef(false) // Track if we've already verified files

  // Log component lifecycle
  useEffect(() => {
    const userId = user?.id || null
    
    if (!docId) {
      return
    }
    
    // Skip if already loading
    if (isLoadingRef.current) {
      return
    }
    
    // Skip if already loaded for this docId and userId combination
    if (loadedDocIdRef.current === docId && loadedUserIdRef.current === userId) {
      return
    }
    
    loadCountRef.current += 1
    const loadId = loadCountRef.current
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

  // Listen for force save before mode change
  useEffect(() => {
    const handleForceSave = async (e) => {
      if (!excalidrawAPIRef.current || !docId) return
      
      try {
        // Get current state from Excalidraw API
        const elements = excalidrawAPIRef.current.getSceneElements()
        const appState = excalidrawAPIRef.current.getAppState()
        
        if (elements) {
          console.log('[DrawingPanel] Force saving before mode change', { elementsCount: elements.length })
          // Clear any pending timeout and save immediately
          if (saveTimeout.current) {
            clearTimeout(saveTimeout.current)
            saveTimeout.current = null
          }
          
          // Call saveContent directly
          const currentViewport = viewportState
          let files = {}
          try {
            files = excalidrawAPIRef.current.getFiles()
          } catch (err) {
            console.warn('Failed to get files in force save:', err)
          }
          
          const newContent = {
            elements,
            files,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              scrollX: currentViewport.scrollX,
              scrollY: currentViewport.scrollY,
              zoom: currentViewport.zoom
            }
          }
          
          const contentString = JSON.stringify(newContent)
          if (contentString !== lastSavedContent.current) {
            setIsSyncing(true)
            // Save files to both places for backup/recovery
            await updateDocumentContent(docId, { 
              drawing_content: newContent,
              drawing_files: files  // Save files separately
            })
            lastSavedContent.current = contentString
            console.log('[DrawingPanel] ✅ Force save completed')
            setIsSyncing(false)
          }
        }
      } catch (err) {
        console.warn('[DrawingPanel] Error in force save:', err)
        setIsSyncing(false)
      }
    }
    
    window.addEventListener('forceSaveBeforeModeChange', handleForceSave)
    return () => {
      window.removeEventListener('forceSaveBeforeModeChange', handleForceSave)
    }
  }, [docId, viewportState])

  // Validate and normalize file objects for Excalidraw
  function normalizeFiles(files) {
    if (!files || typeof files !== 'object') {
      return {}
    }
    
    const normalized = {}
    for (const [fileId, file] of Object.entries(files)) {
      if (!file || typeof file !== 'object') {
        continue
      }
      
      // Ensure required fields exist - Excalidraw expects BinaryFileData format
      const normalizedFile = {
        id: file.id || fileId,
        mimeType: file.mimeType || 'image/png',
        dataURL: file.dataURL || '',
        created: file.created || Date.now(),
        lastRetrieved: file.lastRetrieved || Date.now()
      }
      
      // Validate and fix dataURL format
      if (normalizedFile.dataURL) {
        let dataURL = normalizedFile.dataURL
        
        // Ensure dataURL has proper format
        if (!dataURL.startsWith('data:') && 
            !dataURL.startsWith('http://') && 
            !dataURL.startsWith('https://')) {
          // If it's base64 without prefix, add data URL prefix
          if (dataURL.length > 100) { // Likely base64
            dataURL = `data:${normalizedFile.mimeType};base64,${dataURL}`
            normalizedFile.dataURL = dataURL
          } else {
            console.warn(`[DrawingPanel] Invalid dataURL format for file ${fileId}, skipping`)
            continue
          }
        }
        
        // Validate dataURL is not empty and has valid format
        if (dataURL.length < 50) {
          console.warn(`[DrawingPanel] dataURL too short for file ${fileId}, skipping`)
          continue
        }
        
        // Ensure dataURL is a proper data URL
        if (dataURL.startsWith('data:')) {
          // Verify it has the format: data:mimeType;base64,base64data
          const parts = dataURL.split(',')
          if (parts.length !== 2) {
            console.warn(`[DrawingPanel] Malformed dataURL for file ${fileId}, fixing...`)
            // Try to fix: if it's missing the comma, add it
            if (!dataURL.includes(',')) {
              const base64Match = dataURL.match(/base64(.+)$/)
              if (base64Match) {
                dataURL = `data:${normalizedFile.mimeType};base64,${base64Match[1]}`
                normalizedFile.dataURL = dataURL
              } else {
                console.warn(`[DrawingPanel] Cannot fix dataURL for file ${fileId}, skipping`)
                continue
              }
            }
          }
        }
        
        normalized[fileId] = normalizedFile
      } else {
        console.warn(`[DrawingPanel] Missing dataURL for file ${fileId}, skipping`)
      }
    }
    
    console.log(`[DrawingPanel] Normalized ${Object.keys(normalized).length} files from ${Object.keys(files).length} total`)
    return normalized
  }

  async function loadContent(loadId) {
    isLoadingRef.current = true
    const userId = user?.id || null
    try {
      const content = await getDocumentContent(docId)
      
      if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
        // Ensure appState has proper structure for backward compatibility
        const drawingContent = content.drawing_content
        if (!drawingContent.appState) {
          drawingContent.appState = {}
        }
        
        // Load files from both drawing_content.files AND drawing_files column (backup/recovery)
        let filesFromContent = drawingContent.files || {}
        const filesFromColumn = content.drawing_files || {}
        
        // Merge files: prioritize drawing_content.files, but use drawing_files column as fallback
        const mergedFiles = { ...filesFromColumn, ...filesFromContent }
        
        // Normalize and validate merged files
        const normalizedFiles = normalizeFiles(mergedFiles)
        
        // Log recovery information
        const recoveredFiles = Object.keys(filesFromColumn).filter(id => !filesFromContent[id])
        if (recoveredFiles.length > 0) {
          console.log(`[DrawingPanel] Recovered ${recoveredFiles.length} files from drawing_files column:`, recoveredFiles)
        }
        
        // Set normalized files back to drawingContent
        drawingContent.files = normalizedFiles
        
        // Log image elements and their fileIds for debugging
        const imageElements = drawingContent.elements?.filter(e => e.type === 'image') || []
        console.log(`[DrawingPanel] Found ${imageElements.length} image elements`)
        imageElements.forEach((el, idx) => {
          const fileId = el.fileId
          const hasFile = fileId && normalizedFiles[fileId]
          const source = hasFile ? (filesFromContent[fileId] ? 'drawing_content' : 'drawing_files') : 'none'
          console.log(`[DrawingPanel] Image ${idx}: fileId=${fileId}, hasFile=${!!hasFile}, source=${source}, fileDataURL length=${hasFile ? normalizedFiles[fileId].dataURL?.length : 0}`)
        })
        
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
          files: {},
          appState: defaultViewport
        }
        setInitialData(defaultData)
        lastSavedContent.current = JSON.stringify(defaultData)
      }
      
      // Mark as loaded for this docId/userId combination
      loadedDocIdRef.current = docId
      loadedUserIdRef.current = userId
      // Reset files verification flag when loading new content
      filesVerifiedRef.current = false
    } catch (err) {
      console.error(`[DrawingPanel] loadContent #${loadId} - Failed:`, err)
      const defaultViewport = { scrollX: 0, scrollY: 0, zoom: { value: 1.0, offsetX: 0, offsetY: 0 } }
      setViewportState(defaultViewport)
      setInitialData({
        elements: [],
        files: {},
        appState: defaultViewport
      })
      // Still mark as loaded even on error to prevent retry loops
      loadedDocIdRef.current = docId
      loadedUserIdRef.current = userId
      filesVerifiedRef.current = false
    } finally {
      isLoadingRef.current = false
    }
  }

  function handleExcalidrawAPI(api) {
    excalidrawAPIRef.current = api
    
    // After API is ready, explicitly load files if we have them in initialData
    if (api && initialData && initialData.files && Object.keys(initialData.files).length > 0) {
      // Small delay to ensure Excalidraw is fully initialized
      setTimeout(() => {
        try {
          // Get current files from API
          const currentFiles = api.getFiles() || {}
          
          // Check which files need to be loaded
          const filesToLoad = {}
          const imageElements = initialData.elements?.filter(e => e.type === 'image') || []
          
          for (const el of imageElements) {
            const fileId = el.fileId
            if (fileId && initialData.files[fileId]) {
              // Check if file is missing or different
              if (!currentFiles[fileId] || 
                  !currentFiles[fileId].dataURL || 
                  currentFiles[fileId].dataURL !== initialData.files[fileId].dataURL) {
                filesToLoad[fileId] = initialData.files[fileId]
              }
            }
          }
          
          if (Object.keys(filesToLoad).length > 0) {
            console.log(`[DrawingPanel] Loading ${Object.keys(filesToLoad).length} files via updateScene`)
            console.log('[DrawingPanel] File IDs to load:', Object.keys(filesToLoad))
            
            // Log file details for debugging
            Object.entries(filesToLoad).forEach(([fileId, file]) => {
              console.log(`[DrawingPanel] File ${fileId}:`, {
                hasDataURL: !!file.dataURL,
                dataURLLength: file.dataURL?.length,
                mimeType: file.mimeType,
                dataURLStart: file.dataURL?.substring(0, 50)
              })
            })
            
            // Merge all files (current + new) to ensure we don't lose any
            const allFiles = {
              ...currentFiles,
              ...filesToLoad
            }
            
            // Use updateScene to explicitly load files
            // This ensures files are properly loaded even if initialData didn't work
            api.updateScene({
              elements: initialData.elements || [],
              appState: initialData.appState || {},
              files: allFiles
            })
            
            // Verify files were loaded after a delay, retry if needed
            setTimeout(() => {
              const verifyFiles = api.getFiles() || {}
              const missingFiles = Object.keys(filesToLoad).filter(id => !verifyFiles[id] || !verifyFiles[id].dataURL)
              
              if (missingFiles.length > 0) {
                console.warn(`[DrawingPanel] ${missingFiles.length} files failed to load, retrying...`, missingFiles)
                
                // Retry loading missing files
                const retryFiles = {}
                missingFiles.forEach(id => {
                  if (filesToLoad[id]) {
                    retryFiles[id] = filesToLoad[id]
                  }
                })
                
                if (Object.keys(retryFiles).length > 0) {
                  setTimeout(() => {
                    const currentFilesRetry = api.getFiles() || {}
                    api.updateScene({
                      files: {
                        ...currentFilesRetry,
                        ...retryFiles
                      }
                    })
                    console.log('[DrawingPanel] Retried loading files')
                  }, 500)
                }
              } else {
                console.log(`[DrawingPanel] ✅ All ${Object.keys(filesToLoad).length} files loaded successfully`)
              }
            }, 500)
          } else if (imageElements.length > 0) {
            console.log(`[DrawingPanel] All ${imageElements.length} image files are already loaded`)
          }
        } catch (err) {
          console.warn('[DrawingPanel] Error loading files via API:', err)
        }
      }, 1000) // Delay to ensure Excalidraw is fully ready
    }
  }

  function handleChange(elements, appState) {
    console.log('[DrawingPanel] onChange triggered', { elementsCount: elements.length })
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
      // Get current files to save separately
      let files = currentContent.files || {}
      if (excalidrawAPIRef.current) {
        try {
          files = excalidrawAPIRef.current.getFiles() || files
        } catch (err) {
          console.warn('Failed to get files in saveViewportState:', err)
        }
      }
      setIsSyncing(true)
      // Save files separately for backup/recovery
      await updateDocumentContent(docId, { 
        drawing_content: newContent,
        drawing_files: files
      })
      lastSavedContent.current = contentString
    } catch (err) {
      console.error('Failed to save viewport state:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  async function saveContent(elements, appState) {
    if (!docId) {
      console.warn('[DrawingPanel] Cannot save: no docId')
      return
    }
    
    console.log('[DrawingPanel] saveContent called', { elementsCount: elements.length, docId })
    
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
    
    const currentContent = JSON.stringify(newContent)
    if (currentContent === lastSavedContent.current) {
      console.log('[DrawingPanel] No changes to save')
      return
    }
    
    try {
      console.log('[DrawingPanel] Saving to database...')
      console.log(`[DrawingPanel] Saving ${Object.keys(files).length} files to both drawing_content.files and drawing_files column`)
      setIsSyncing(true)
      
      // Save files to BOTH places:
      // 1. In drawing_content.files (as part of the JSON)
      // 2. In drawing_files column (separate column for backup/recovery)
      await updateDocumentContent(docId, { 
        drawing_content: newContent,
        drawing_files: files  // Save files separately for recovery
      })
      
      lastSavedContent.current = currentContent
      console.log('[DrawingPanel] ✅ Successfully saved!')
    } catch (err) {
      console.error('[DrawingPanel] ❌ Failed to save drawing:', err)
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

  const excalidrawKey = `${docId}-${user?.id || 'guest'}`
  
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
