import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useState, useEffect, useRef } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { Loader, Center, Alert, Text } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'

export default function DrawingPanel({ docId, editable = true }) {
  // Treat undefined as "not yet determined" - default to editable
  const isEditable = editable !== undefined ? editable : true
  const [initialData, setInitialData] = useState(null)
  const saveTimeout = useRef(null)
  const excalidrawRef = useRef(null)
  const lastSavedContent = useRef(null)
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
        lastSavedContent.current = JSON.stringify(content.drawing_content)
      } else {
        const defaultData = { elements: [], appState: {} }
        setInitialData(defaultData)
        lastSavedContent.current = JSON.stringify(defaultData)
      }
    } catch (err) {
      console.error('Failed to load drawing:', err)
      setInitialData({ elements: [], appState: {} })
    }
  }

  function handleChange(elements, appState) {
    if (!isEditable) return // Don't save if not editable
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveContent(elements, appState)
    }, 1000)
  }

  async function saveContent(elements, appState) {
    if (!docId) return
    const newContent = { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } }
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

  // Only show the blocked warning if explicitly not editable
  // If editable is undefined, we're still loading permissions, so show the editor
  // This prevents the banner from flashing during initial load
  if (!isEditable) {
    return (
      <div style={{ height: '100%', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert
          icon={<IconLock size={16} />}
          title="Drawing tool unavailable"
          color="yellow"
          style={{ maxWidth: 400 }}
        >
          <Text size="sm">
            Drawing tool is only available to Owners. Editors can edit text content but cannot modify drawings.
          </Text>
        </Alert>
      </div>
    )
  }

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
