import { Box, SegmentedControl, Textarea, Loader, Center } from '@mantine/core'
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

// Helper to check if a block is empty
function isEmptyBlock(block) {
  if (!block.content) return true
  if (Array.isArray(block.content)) {
    return block.content.length === 0 || 
           block.content.every(item => 
             (typeof item === 'string' && item.trim() === '') ||
             (typeof item === 'object' && (!item.text || item.text.trim() === ''))
           )
  }
  if (typeof block.content === 'string') {
    return block.content.trim() === ''
  }
  return false
}

// Convert blocks to markdown while preserving empty blocks
async function blocksToMarkdownPreservingEmpty(editor, blocks) {
  if (blocks.length === 0) return ''
  
  const result = []
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const isEmpty = isEmptyBlock(block)
    
    if (isEmpty && block.type === 'paragraph') {
      // Empty block - represented as empty string
      result.push('')
    } else {
      // Convert this block to markdown
      let blockMd = await editor.blocksToMarkdownLossy([block])
      const trimmed = blockMd.trimEnd()
      if (trimmed) {
        result.push(trimmed)
      }
    }
  }
  
  // Join blocks with double newlines for proper block separation
  // Empty blocks (empty strings) will create triple newlines, which is fine
  return result.join('\n\n')
}

// Convert markdown to blocks while preserving empty lines as empty blocks
async function markdownToBlocksPreservingEmpty(editor, markdown) {
  if (!markdown || markdown.trim() === '') {
    return [{ type: 'paragraph', content: '' }]
  }
  
  // Simply parse with BlockNote - it should handle block separation correctly
  // The key is that our blocksToMarkdownPreservingEmpty uses \n\n to separate blocks
  const parsedBlocks = await editor.tryParseMarkdownToBlocks(markdown)
  
  // Convert back to markdown to see structure
  const reconverted = await editor.blocksToMarkdownLossy(parsedBlocks)
  const originalLines = markdown.split('\n')
  const reconvertedLines = reconverted.split('\n')
  
  // Insert empty blocks where original has empty lines that aren't in reconverted
  const resultBlocks = []
  let origIdx = 0
  let reconvIdx = 0
  let blockIdx = 0
  
  while (origIdx < originalLines.length || blockIdx < parsedBlocks.length) {
    // Check for empty lines in original
    if (origIdx < originalLines.length && originalLines[origIdx].trim() === '') {
      // Check if reconverted also has empty here
      if (reconvIdx < reconvertedLines.length && reconvertedLines[reconvIdx].trim() === '') {
        reconvIdx++
      } else {
        // Original has empty but reconverted doesn't - insert empty block
        resultBlocks.push({
          type: 'paragraph',
          content: '',
        })
      }
      origIdx++
    } else if (blockIdx < parsedBlocks.length) {
      // Add the next parsed block
      resultBlocks.push(parsedBlocks[blockIdx])
      blockIdx++
      
      // Advance original past this block's content
      if (origIdx < originalLines.length) {
        origIdx++
        // Skip continuation lines
        while (origIdx < originalLines.length && originalLines[origIdx].trim() !== '') {
          origIdx++
        }
      }
      
      // Advance reconverted past this block's content
      if (reconvIdx < reconvertedLines.length) {
        reconvIdx++
        while (reconvIdx < reconvertedLines.length && reconvertedLines[reconvIdx].trim() !== '') {
          reconvIdx++
        }
      }
    } else {
      // Only original remains - might be trailing empty lines
      if (origIdx < originalLines.length && originalLines[origIdx].trim() === '') {
        resultBlocks.push({
          type: 'paragraph',
          content: '',
        })
      }
      origIdx++
    }
  }
  
  return resultBlocks.length > 0 ? resultBlocks : [{ type: 'paragraph', content: '' }]
}

export default function NotesPanel({ docId, editable = true }) {
  // Treat undefined as "not yet determined" - default to editable
  const isEditable = editable !== undefined ? editable : true
  const [textMode, setTextMode] = useState('text')
  const [markdownText, setMarkdownText] = useState('')
  const [loading, setLoading] = useState(true)
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  const saveTimeout = useRef(null)
  const lastSavedContent = useRef(null)
  const lastSavedTextMode = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()

  // Load content when docId changes
  useEffect(() => {
    if (!docId) return
    setLoading(true)
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
      // Load text mode
      if (content?.text_mode) {
        setTextMode(content.text_mode)
        lastSavedTextMode.current = content.text_mode
      } else {
        setTextMode('text')
        lastSavedTextMode.current = 'text'
      }
      // Also load markdown if stored
      const md = await blocksToMarkdownPreservingEmpty(editor, editor.document)
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
    } finally {
      setLoading(false)
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
      const md = await blocksToMarkdownPreservingEmpty(editor, editor.document)
      setMarkdownText(md)
    } else if (newMode === 'text' && textMode === 'markdown') {
      // Convert markdown to blocks
      const blocks = await markdownToBlocksPreservingEmpty(editor, markdownText)
      editor.replaceBlocks(editor.document, blocks)
      saveContent()
    }
    setTextMode(newMode)
    // Save text mode preference
    if (newMode !== lastSavedTextMode.current) {
      lastSavedTextMode.current = newMode
      try {
        await updateDocumentContent(docId, { text_mode: newMode })
      } catch (err) {
        console.error('Failed to save text mode:', err)
      }
    }
  }

  async function handleMarkdownChange(value) {
    setMarkdownText(value)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      // Convert and save
      const blocks = await markdownToBlocksPreservingEmpty(editor, value)
      editor.replaceBlocks(editor.document, blocks)
      saveContent()
    }, 1000)
  }

  if (loading) {
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {isEditable && (
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
      )}
      <Box style={{ flex: 1, overflow: 'auto', paddingTop: 40, paddingBottom: 400 }}>
        {textMode === 'text' ? (
          <BlockNoteView 
            editor={editor} 
            theme={colorScheme} 
            onChange={isEditable ? handleChange : undefined}
            editable={isEditable}
          />
        ) : (
          <Textarea
            value={markdownText}
            onChange={isEditable ? (e) => handleMarkdownChange(e.target.value) : undefined}
            placeholder="Write markdown here..."
            disabled={!isEditable}
            styles={{
              root: { height: '100%' },
              wrapper: { height: '100%' },
              input: { 
                height: '100%',
                fontFamily: 'monospace',
                fontSize: 14,
                border: 'none',
                resize: 'none',
                paddingBottom: 400,
                boxSizing: 'content-box',
              },
            }}
          />
        )}
      </Box>
    </Box>
  )
}
