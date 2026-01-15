import { useState, useEffect, useRef } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { getDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { Loader, Center, Text, Box } from '@mantine/core'

/**
 * Renders an Excalidraw diagram from a drawing document
 * @param {string} drawingDocId - ID of the drawing document
 * @param {string} format - 'block' or 'inline'
 * @param {Object} options - Rendering options
 */
export default function DiagramRenderer({ drawingDocId, format = 'block', options = {} }) {
  const [drawingData, setDrawingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { colorScheme } = useTheme()
  const excalidrawAPIRef = useRef(null)
  
  useEffect(() => {
    if (drawingDocId) {
      loadDiagram()
    } else {
      setError('No diagram ID provided')
      setLoading(false)
    }
  }, [drawingDocId])
  
  async function loadDiagram() {
    if (!drawingDocId) return
    
    try {
      setLoading(true)
      setError(null)
      const content = await getDocumentContent(drawingDocId)
      
      if (!content?.drawing_content) {
        setError('Drawing not found')
        return
      }
      
      // Ensure drawing_content has proper structure
      const drawingContent = content.drawing_content
      if (!drawingContent.elements) {
        drawingContent.elements = []
      }
      if (!drawingContent.appState) {
        drawingContent.appState = {}
      }
      if (!drawingContent.files) {
        drawingContent.files = content.drawing_files || {}
      }
      
      setDrawingData(drawingContent)
    } catch (err) {
      setError('Failed to load diagram')
      console.error('DiagramRenderer: Failed to load diagram:', err)
    } finally {
      setLoading(false)
    }
  }
  
  function handleExcalidrawAPI(api) {
    excalidrawAPIRef.current = api
  }
  
  if (loading) {
    return (
      <Center style={{ padding: '20px' }}>
        <Loader size="sm" />
      </Center>
    )
  }
  
  if (error) {
    return (
      <Box style={{ padding: '20px', textAlign: 'center' }}>
        <Text c="dimmed" size="sm">{error}</Text>
      </Box>
    )
  }
  
  if (!drawingData) {
    return null
  }
  
  // Block-level: full width, larger height
  if (format === 'block') {
    return (
      <Box 
        style={{ 
          width: '100%', 
          height: options.height || '400px', 
          border: `1px solid ${colorScheme === 'dark' ? '#444' : '#ddd'}`,
          borderRadius: '4px',
          margin: '16px 0',
          overflow: 'hidden',
          backgroundColor: colorScheme === 'dark' ? '#1a1b1e' : '#ffffff'
        }}
      >
        <Excalidraw
          excalidrawAPI={handleExcalidrawAPI}
          initialData={{
            ...drawingData,
            scrollToContent: false
          }}
          viewModeEnabled={true}
          zenModeEnabled={false}
          theme={colorScheme}
        />
      </Box>
    )
  }
  
  // Inline: smaller, compact view
  return (
    <Box 
      component="span"
      style={{ 
        display: 'inline-block',
        width: options.width || '200px',
        height: options.height || '150px',
        border: `1px solid ${colorScheme === 'dark' ? '#444' : '#ddd'}`,
        borderRadius: '4px',
        margin: '0 4px',
        verticalAlign: 'middle',
        overflow: 'hidden',
        backgroundColor: colorScheme === 'dark' ? '#1a1b1e' : '#ffffff'
      }}
    >
      <Excalidraw
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          ...drawingData,
          scrollToContent: false
        }}
        viewModeEnabled={true}
        zenModeEnabled={false}
        theme={colorScheme}
      />
    </Box>
  )
}
