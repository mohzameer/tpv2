import { Box, SegmentedControl, Textarea } from '@mantine/core'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './NotesPanel.css'
import { useState, useEffect, useRef } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'

// Only keep markdown-compatible block types
const { 
  audio, video, file, image, // remove media blocks
  ...markdownBlocks 
} = defaultBlockSpecs

const schema = BlockNoteSchema.create({
  blockSpecs: markdownBlocks,
})

const defaultBlocks = [
  { type: 'heading', props: { level: 2 }, content: 'Untitled' },
  { type: 'paragraph', content: '' },
]

export default function NotesPanel({ docId }) {
  const [textMode, setTextMode] = useState('text')
  const [markdownText, setMarkdownText] = useState('')
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  const saveTimeout = useRef(null)
  const lastSavedContent = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()

  // Load content when docId changes
  useEffect(() => {
    if (!docId) return
    loadContent()
  }, [docId])

  async function loadContent() {
    try {
      const content = await getDocumentContent(docId)
      if (content?.notes_content && Array.isArray(content.notes_content) && content.notes_content.length > 0) {
        editor.replaceBlocks(editor.document, content.notes_content)
        lastSavedContent.current = JSON.stringify(content.notes_content)
      } else {
        // Set default blocks for new document
        editor.replaceBlocks(editor.document, defaultBlocks)
        lastSavedContent.current = JSON.stringify(defaultBlocks)
      }
      // Also load markdown if stored
      const md = await editor.blocksToMarkdownLossy(editor.document)
      setMarkdownText(md)
      
      // Focus on second block
      setTimeout(() => {
        const blocks = editor.document
        if (blocks.length > 1) {
          editor.setTextCursorPosition(blocks[1].id, 'start')
        }
      }, 100)
    } catch (err) {
      console.error('Failed to load notes:', err)
    }
  }

  function handleChange() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveContent()
    }, 1000)
  }

  async function saveContent() {
    if (!docId) return
    const currentContent = JSON.stringify(editor.document)
    if (currentContent === lastSavedContent.current) return
    
    try {
      setIsSyncing(true)
      await updateDocumentContent(docId, { notes_content: editor.document })
      lastSavedContent.current = currentContent
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleModeChange(newMode) {
    if (newMode === 'markdown' && textMode === 'text') {
      // Convert blocks to markdown
      const md = await editor.blocksToMarkdownLossy(editor.document)
      setMarkdownText(md)
    } else if (newMode === 'text' && textMode === 'markdown') {
      // Convert markdown to blocks
      const blocks = await editor.tryParseMarkdownToBlocks(markdownText)
      editor.replaceBlocks(editor.document, blocks)
      saveContent()
    }
    setTextMode(newMode)
  }

  async function handleMarkdownChange(value) {
    setMarkdownText(value)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      // Convert and save
      const blocks = await editor.tryParseMarkdownToBlocks(value)
      editor.replaceBlocks(editor.document, blocks)
      saveContent()
    }, 1000)
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
        <SegmentedControl
          size="xs"
          value={textMode}
          onChange={handleModeChange}
          data={[
            { label: 'Text', value: 'text' },
            { label: 'Markdown', value: 'markdown' },
          ]}
        />
      </Box>
      <Box style={{ flex: 1, overflow: 'auto', paddingTop: 40 }}>
        {textMode === 'text' ? (
          <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
        ) : (
          <Textarea
            value={markdownText}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            placeholder="Write markdown here..."
            styles={{
              root: { height: '100%' },
              wrapper: { height: '100%' },
              input: { 
                height: '100%', 
                fontFamily: 'monospace',
                fontSize: 14,
                border: 'none',
                resize: 'none',
              },
            }}
          />
        )}
      </Box>
    </Box>
  )
}
