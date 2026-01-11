import { Box, SegmentedControl, Textarea, Loader, Center } from '@mantine/core'
import { IconCopy } from '@tabler/icons-react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './NotesPanel.css'
import { useState, useEffect, useRef } from 'react'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useAuth } from '../context/AuthContext'

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

// Helper to extract plain text from code block content
function getCodeBlockPlainText(block) {
  if (!block?.content) return ''
  if (Array.isArray(block.content)) {
    return block.content
      .map((inline) => {
        if (typeof inline === 'string') return inline
        if (typeof inline === 'object' && inline.text) return inline.text
        return ''
      })
      .join('')
  }
  if (typeof block.content === 'string') {
    return block.content
  }
  return ''
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

// Hook to track block selection
function useBlockSelection(editor) {
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!editor) return

    const updateState = () => {
      // Try to get selection first
      const selection = editor.getSelection()
      let block = null
      
      if (selection && selection.blocks && selection.blocks.length > 0) {
        // Use the first selected block
        block = selection.blocks[0]
      } else {
        // If no selection, get block at cursor position
        const cursorPosition = editor.getTextCursorPosition()
        if (cursorPosition) {
          block = cursorPosition.block
        }
      }

      if (!block) {
        setState(null)
        return
      }

      // Find the block's DOM element by traversing from selection/cursor
      let blockRect = null
      try {
        const domSelection = window.getSelection()
        let startElement = null
        
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0)
          startElement = range.commonAncestorContainer
        } else {
          // No selection, try to find active element (cursor position)
          const activeElement = document.activeElement
          if (activeElement) {
            startElement = activeElement
          }
        }
        
        if (startElement) {
          let element = startElement
          
          // If it's a text node, get the parent element
          if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement
          }
          
          // Walk up the DOM tree to find the code block container
          while (element) {
            // Check for BlockNote code block indicators
            const nodeType = element.getAttribute?.('data-node-type')
            const className = element.className || ''
            
            if (nodeType === 'codeBlock' || 
                className.includes('codeBlock') ||
                element.tagName === 'PRE' ||
                (element.tagName === 'CODE' && element.closest('pre'))) {
              // Found the code block container
              const codeBlockContainer = element.tagName === 'CODE' ? element.closest('pre') || element.parentElement : element
              if (codeBlockContainer) {
                blockRect = codeBlockContainer.getBoundingClientRect()
                break
              }
            }
            
            // Stop if we've reached the editor root
            if (element.classList?.contains('bn-editor') || 
                element.hasAttribute?.('data-blocknote-editor')) {
              break
            }
            
            element = element.parentElement
          }
        }
      } catch (err) {
        console.debug('Could not find block DOM element:', err)
      }

      setState({
        block,
        blockRect,
      })
    }

    const unsubscribe = editor.onSelectionChange(updateState)
    
    // Also update on scroll/resize to keep button position correct
    const handleScroll = () => updateState()
    const handleResize = () => updateState()
    
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    
    // Initial update
    updateState()

    return () => {
      unsubscribe()
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [editor])

  return state
}

// Floating copy button component (only for code blocks)
function FloatingCopyButton({ editor }) {
  const selection = useBlockSelection(editor)

  // Only show for code blocks
  if (!selection?.block || selection.block.type !== 'codeBlock') return null

  // Only show if we have the block's DOM position
  if (!selection.blockRect) return null

  const buttonStyle = {
    position: 'fixed',
    top: selection.blockRect.top + window.scrollY + 4,
    left: selection.blockRect.right + window.scrollX - 28,
    zIndex: 1000,
    width: '24px',
    height: '24px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    border: '1px solid rgba(0,0,0,0.2)',
    background: 'rgba(255,255,255,0.95)',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  }

  const handleCopy = async () => {
    try {
      // Get plain text from the code block
      let text = getCodeBlockPlainText(selection.block)
      if (!text.trim()) {
        console.warn('No text to copy from code block')
        return
      }
      
      // Remove trailing backslashes from each line (sanitize)
      text = text
        .split('\n')
        .map(line => line.replace(/\\+$/, ''))
        .join('\n')
      
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy code block:', err)
    }
  }

  return (
    <button
      style={buttonStyle}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleCopy}
      title="Copy code"
    >
      <IconCopy size={14} />
    </button>
  )
}

export default function NotesPanel({ docId }) {
  const [textMode, setTextMode] = useState('text')
  const [markdownText, setMarkdownText] = useState('')
  const [loading, setLoading] = useState(true)
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  const saveTimeout = useRef(null)
  const lastSavedContent = useRef(null)
  const lastSavedTextMode = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()

  // Load content when docId changes or when auth state changes (user logs in/out)
  const { user } = useAuth()
  
  useEffect(() => {
    if (!docId) return
    setLoading(true)
    loadContent()
  }, [docId, user]) // Reload when docId or user (auth state) changes

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
      <Box style={{ flex: 1, overflow: 'auto', paddingTop: 40, paddingBottom: 400 }}>
        {textMode === 'text' ? (
          <>
            <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
            <FloatingCopyButton editor={editor} />
          </>
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
