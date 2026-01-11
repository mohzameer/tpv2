import { Box, SegmentedControl, Textarea, Loader, Center } from '@mantine/core'
import { IconCopy } from '@tabler/icons-react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './NotesPanel.css'
import { useState, useEffect, useRef, useMemo } from 'react'
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

// Hook to track hovered block globally (single listener, throttled with RAF)
function useHoveredBlockId() {
  const [blockElement, setBlockElement] = useState(null)

  useEffect(() => {
    let raf = null

    const onMouseMove = (e) => {
      if (raf) return

      raf = requestAnimationFrame(() => {
        raf = null

        const target = e.target
        if (!target) {
          setBlockElement(null)
          return
        }

        // Walk up the DOM to find code block container
        let element = target
        if (element.nodeType === Node.TEXT_NODE) {
          element = element.parentElement
        }
        
        let codeBlockEl = null
        
        while (element) {
          const nodeType = element.getAttribute?.('data-node-type')
          const className = element.className || ''
          
          // Check if it's a code block
          if (nodeType === 'codeBlock') {
            codeBlockEl = element
            break
          }
          
          // Also check for PRE tags (code blocks are rendered as PRE)
          if (element.tagName === 'PRE' && element.closest('.bn-editor')) {
            codeBlockEl = element
            break
          }
          
          // Check for CODE inside PRE
          if (element.tagName === 'CODE') {
            const pre = element.closest('pre')
            if (pre && pre.closest('.bn-editor')) {
              codeBlockEl = pre
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

        setBlockElement(codeBlockEl)
      })
    }

    const onMouseLeave = (e) => {
      // Clear hover when mouse leaves the editor area
      if (!e.relatedTarget || !e.relatedTarget.closest?.('.bn-editor')) {
        setBlockElement(null)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave, true)
    
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave, true)
      if (raf) {
        cancelAnimationFrame(raf)
      }
    }
  }, [])

  return blockElement
}

// Helper to normalize text for comparison (more lenient)
function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')  // Normalize all whitespace to single spaces
    .trim()
}

// Helper to find block ID from DOM element by matching content with editor blocks
function findBlockIdFromElement(blockElement, editor) {
  if (!blockElement || !editor) return null
  
  // Get text content from the DOM element
  const domText = normalizeText(blockElement.textContent || '')
  
  // Find matching block in editor by comparing content
  const codeBlocks = editor.document.filter(b => b.type === 'codeBlock')
  
  // Try exact match first
  for (const block of codeBlocks) {
    const blockText = normalizeText(getCodeBlockPlainText(block))
    if (blockText === domText) {
      return block.id
    }
  }
  
  // If no exact match, try to find by position in DOM
  // Get all code blocks in DOM in order
  const editorEl = document.querySelector('.bn-editor')
  if (editorEl) {
    const domCodeBlocks = Array.from(editorEl.querySelectorAll('[data-node-type="codeBlock"], pre'))
    const blockIndex = domCodeBlocks.indexOf(blockElement)
    if (blockIndex >= 0 && blockIndex < codeBlocks.length) {
      return codeBlocks[blockIndex].id
    }
  }
  
  return null
}

// Hook to get selected block from editor
function useSelectedBlock(editor) {
  const [selectedBlock, setSelectedBlock] = useState(null)

  useEffect(() => {
    if (!editor) return

    const updateSelection = () => {
      const selection = editor.getSelection()
      let block = null
      
      if (selection && selection.blocks && selection.blocks.length > 0) {
        block = selection.blocks[0]
      } else {
        const cursorPosition = editor.getTextCursorPosition()
        if (cursorPosition) {
          block = cursorPosition.block
        }
      }
      
      setSelectedBlock(block)
    }

    const unsubscribe = editor.onSelectionChange(updateSelection)
    updateSelection()

    return () => {
      unsubscribe()
    }
  }, [editor])

  return selectedBlock
}

// Floating copy button component (only for code blocks) - hover-based
function FloatingCopyButton({ editor }) {
  const hoveredBlockElement = useHoveredBlockId()
  const selectedBlock = useSelectedBlock(editor)
  const [blockRect, setBlockRect] = useState(null)
  const [opacity, setOpacity] = useState(0)

  // Determine which code block element to show toolbar for
  // Selection takes priority over hover
  const { activeElement, activeBlock } = useMemo(() => {
    let element = null
    let block = null

    if (selectedBlock && selectedBlock.type === 'codeBlock') {
      // Try to find the selected block's DOM element
      const editorEl = document.querySelector('.bn-editor')
      if (editorEl) {
        const codeBlocks = Array.from(editorEl.querySelectorAll('[data-node-type="codeBlock"], pre'))
        const allCodeBlocks = editor?.document?.filter(b => b.type === 'codeBlock') || []
        const blockIndex = allCodeBlocks.findIndex(b => b.id === selectedBlock.id)
        
        if (blockIndex >= 0 && blockIndex < codeBlocks.length) {
          element = codeBlocks[blockIndex]
          block = selectedBlock
        }
      }
    } else if (hoveredBlockElement) {
      // Use hovered element directly - no need to match to editor block
      element = hoveredBlockElement
      // Try to find the block from editor, but don't require it
      if (editor) {
        const blockId = findBlockIdFromElement(hoveredBlockElement, editor)
        if (blockId) {
          block = editor.document.find(b => b.id === blockId)
        }
      }
    }

    return { activeElement: element, activeBlock: block }
  }, [selectedBlock, hoveredBlockElement, editor])

  // Update rect and opacity
  useEffect(() => {
    if (!activeElement) {
      setBlockRect(null)
      setOpacity(0)
      return
    }

    const updateRect = () => {
      const rect = activeElement.getBoundingClientRect()
      if (rect) {
        setBlockRect(rect)
        setOpacity(1)
      } else {
        setBlockRect(null)
        setOpacity(0)
      }
    }

    updateRect()

    // Update on scroll/resize
    const handleScroll = () => updateRect()
    const handleResize = () => updateRect()
    
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeElement])

  // Hide toolbar when editor loses focus and no hover (UX polish)
  useEffect(() => {
    if (!editor || !activeElement) return
    
    // If we have a selected block, always show (selection takes priority)
    if (selectedBlock && selectedBlock.type === 'codeBlock' && selectedBlock.id === activeBlock?.id) {
      return
    }
    
    const checkFocus = () => {
      const isFocused = editor.isFocused?.() ?? document.activeElement?.closest('.bn-editor') !== null
      if (!isFocused && !hoveredBlockElement) {
        setOpacity(0)
      } else if ((isFocused || hoveredBlockElement) && blockRect) {
        // Restore opacity if we have focus or hover
        setOpacity(1)
      }
    }

    const handleFocus = () => {
      setTimeout(checkFocus, 50)
    }
    const handleBlur = () => {
      setTimeout(checkFocus, 150)
    }

    document.addEventListener('focusin', handleFocus)
    document.addEventListener('focusout', handleBlur)
    
    return () => {
      document.removeEventListener('focusin', handleFocus)
      document.removeEventListener('focusout', handleBlur)
    }
  }, [editor, hoveredBlockElement, activeElement, selectedBlock, activeBlock, blockRect])

  if (!activeElement || !blockRect) return null

  // Header height is 50px - avoid overlapping with header
  const HEADER_HEIGHT = 50
  const buttonTop = blockRect.top + 4
  
  // If button would overlap with header, position it just below the header
  // Otherwise, keep it relative to the code block
  const finalTop = buttonTop < HEADER_HEIGHT 
    ? HEADER_HEIGHT + 8  // Position just below header
    : buttonTop

  const toolbarStyle = {
    position: 'fixed',
    top: finalTop,
    left: blockRect.right - 28,
    zIndex: 1000,
    opacity,
    transition: 'opacity 120ms ease',
    pointerEvents: opacity > 0 ? 'auto' : 'none',
  }

  const buttonStyle = {
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
      // Get text directly from the DOM element - more reliable than matching to editor block
      let text = activeElement.textContent || ''
      
      // Fallback to editor block if available
      if (!text.trim() && activeBlock) {
        text = getCodeBlockPlainText(activeBlock)
      }
      
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
    <div
      style={toolbarStyle}
      onMouseDown={(e) => e.preventDefault()} // critical - prevents selection collapse
    >
      <button
        style={buttonStyle}
        onClick={handleCopy}
        title="Copy code"
      >
        <IconCopy size={14} />
      </button>
    </div>
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
      <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 1001 }}>
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
      <Box 
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          paddingTop: 40, 
          paddingBottom: 400,
          scrollbarWidth: 'none', /* Firefox */
          msOverflowStyle: 'none', /* IE and Edge */
        }}
        sx={{
          '&::-webkit-scrollbar': {
            display: 'none', /* Chrome, Safari, Opera */
          },
        }}
      >
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
