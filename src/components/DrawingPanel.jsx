import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useState, useEffect, useRef } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'

export default function DrawingPanel({ docId }) {
  const [initialData, setInitialData] = useState(null)
  const saveTimeout = useRef(null)
  const excalidrawRef = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()

  useEffect(() => {
    if (!docId) return
    loadContent()
  }, [docId])

  async function loadContent() {
    try {
      const content = await getDocumentContent(docId)
      if (content?.drawing_content && Object.keys(content.drawing_content).length > 0) {
        setInitialData(content.drawing_content)
      } else {
        setInitialData({ elements: [], appState: {} })
      }
    } catch (err) {
      console.error('Failed to load drawing:', err)
      setInitialData({ elements: [], appState: {} })
    }
  }

  function handleChange(elements, appState) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveContent(elements, appState)
    }, 1000)
  }

  async function saveContent(elements, appState) {
    if (!docId) return
    try {
      setIsSyncing(true)
      await updateDocumentContent(docId, { 
        drawing_content: { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } }
      })
    } catch (err) {
      console.error('Failed to save drawing:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  if (!initialData) return null

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <Excalidraw
        ref={excalidrawRef}
        initialData={initialData}
        zenModeEnabled={true}
        onChange={handleChange}
        theme={colorScheme}
      />
    </div>
  )
}
