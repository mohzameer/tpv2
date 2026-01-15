import { Box, Loader, Center } from '@mantine/core'
import { IconCopy } from '@tabler/icons-react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './NotesPanel.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { getDocumentContent, updateDocumentContent, updateDocumentLinks } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useAuth } from '../context/AuthContext'
import { useEditor } from '../context/EditorContext'
import FloatingLinkButton from './FloatingLinkButton'
import DocumentLinkButtons, { checkOverlap, findNearestNonOverlappingY } from './DocumentLinkButtons'
import DocumentLinkModal from './DocumentLinkModal'
import { useProjectContext } from '../context/ProjectContext'
import { useShowLinks } from '../context/ShowLinksContext'
import { isDrawing } from '../lib/documentType'

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


// Hook to track hovered block globally (single listener, throttled with RAF)
function useHoveredBlockId() {
  const [blockElement, setBlockElement] = useState(null)
  const clearTimeoutRef = useRef(null)

  // Check if editor is visible
  const isEditorVisible = () => {
    const editorEl = document.querySelector('.bn-editor')
    if (!editorEl) return false
    const rect = editorEl.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  useEffect(() => {
    let raf = null

      const onMouseMove = (e) => {
      if (raf) return

      // If editor is not visible, clear hover state immediately
      if (!isEditorVisible()) {
        if (blockElement) {
          setBlockElement(null)
        }
        return
      }

      // Clear any pending timeout
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current)
        clearTimeoutRef.current = null
      }

      raf = requestAnimationFrame(() => {
        raf = null

        const target = e.target
        if (!target) {
          // Small delay before clearing to prevent flicker when moving to button
          clearTimeoutRef.current = setTimeout(() => {
            setBlockElement(null)
          }, 100)
          return
        }

        // Check if hovering over the copy button - if so, keep the current block
        const isOverButton = target.closest('[data-copy-button]') !== null
        if (isOverButton && blockElement) {
          // Keep the current block when hovering over the button
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
      // But add a small delay to allow moving to the button
      if (!e.relatedTarget || !e.relatedTarget.closest?.('.bn-editor')) {
        clearTimeoutRef.current = setTimeout(() => {
          setBlockElement(null)
        }, 150)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave, true)
    
    // Check visibility periodically and clear hover if panel is hidden
    const visibilityCheck = setInterval(() => {
      if (!isEditorVisible() && blockElement) {
        setBlockElement(null)
      }
    }, 200)
    
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave, true)
      clearInterval(visibilityCheck)
      if (raf) {
        cancelAnimationFrame(raf)
      }
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current)
      }
    }
  }, [blockElement])

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
  const [isPanelVisible, setIsPanelVisible] = useState(false) // Start as false, check on mount

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

  // Check if panel is visible (has non-zero width)
  useEffect(() => {
    const checkVisibility = () => {
      const editorEl = document.querySelector('.bn-editor')
      if (!editorEl) {
        setIsPanelVisible(false)
        setBlockRect(null)
        setOpacity(0)
        return
      }
      
      // Check the editor element itself
      const editorRect = editorEl.getBoundingClientRect()
      
      // Check computed styles to see if element is actually visible
      const computedStyle = window.getComputedStyle(editorEl)
      const isDisplayNone = computedStyle.display === 'none'
      const isVisibilityHidden = computedStyle.visibility === 'hidden'
      const isOffsetParentNull = editorEl.offsetParent === null
      
      // Also check if the NotesPanel container (parent) is visible
      // The NotesPanel is inside a Panel from react-resizable-panels
      let panelContainer = editorEl.parentElement
      let panelVisible = true
      
      // Walk up to find the Panel container
      while (panelContainer && panelContainer !== document.body) {
        const panelRect = panelContainer.getBoundingClientRect()
        const panelStyle = window.getComputedStyle(panelContainer)
        if (panelRect.width === 0 || panelRect.height === 0 || 
            panelStyle.display === 'none' || panelStyle.visibility === 'hidden') {
          panelVisible = false
          break
        }
        // Check if we've reached a PanelGroup or similar container
        if (panelContainer.classList?.contains('PanelGroup') || 
            panelContainer.hasAttribute?.('data-panel-group')) {
          break
        }
        panelContainer = panelContainer.parentElement
      }
      
      const visible = editorRect.width > 0 && 
                     editorRect.height > 0 && 
                     panelVisible &&
                     !isDisplayNone &&
                     !isVisibilityHidden &&
                     !isOffsetParentNull
      
      setIsPanelVisible(visible)
      
      // If panel becomes hidden, clear the hover state
      if (!visible) {
        setBlockRect(null)
        setOpacity(0)
      }
    }

    // Check immediately and after a short delay to ensure DOM is ready
    checkVisibility()
    const initialCheck = setTimeout(() => {
      checkVisibility()
    }, 100)

    // Check visibility on resize
    const handleResize = () => {
      checkVisibility()
    }
    
    // Use ResizeObserver to detect when panel size changes
    const editorEl = document.querySelector('.bn-editor')
    let resizeObserver = null
    
    if (editorEl && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        checkVisibility()
      })
      resizeObserver.observe(editorEl)
    }
    
    window.addEventListener('resize', handleResize)
    
    // Also check periodically in case ResizeObserver isn't available
    // Check more frequently to catch any visibility changes
    const interval = setInterval(checkVisibility, 100)
    
    return () => {
      clearTimeout(initialCheck)
      window.removeEventListener('resize', handleResize)
      if (resizeObserver && editorEl) {
        resizeObserver.unobserve(editorEl)
      }
      clearInterval(interval)
    }
  }, [])

  // Update rect and opacity
  useEffect(() => {
    // Early return if panel is not visible
    if (!isPanelVisible) {
      setBlockRect(null)
      setOpacity(0)
      return
    }
    
    if (!activeElement) {
      setBlockRect(null)
      setOpacity(0)
      return
    }

    const updateRect = () => {
      // Double-check visibility before showing button
      const editorEl = document.querySelector('.bn-editor')
      if (!editorEl) {
        setBlockRect(null)
        setOpacity(0)
        return
      }
      
      const editorRect = editorEl.getBoundingClientRect()
      if (editorRect.width === 0 || editorRect.height === 0) {
        setBlockRect(null)
        setOpacity(0)
        return
      }
      
      // Check panel container visibility
      const panelContainer = editorEl.closest('[data-panel-id]') || editorEl.closest('.bn-editor')?.parentElement
      if (panelContainer) {
        const panelRect = panelContainer.getBoundingClientRect()
        if (panelRect.width === 0 || panelRect.height === 0) {
          setBlockRect(null)
          setOpacity(0)
          return
        }
      }

      const rect = activeElement.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        // Verify the code block is actually within the visible editor bounds
        const isWithinEditor = 
          rect.left >= editorRect.left &&
          rect.right <= editorRect.right &&
          rect.top >= editorRect.top &&
          rect.bottom <= editorRect.bottom
        
        if (isWithinEditor) {
          setBlockRect(rect)
          setOpacity(1)
        } else {
          setBlockRect(null)
          setOpacity(0)
        }
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
  }, [activeElement, isPanelVisible])

  // Hide toolbar when editor loses focus and no hover (UX polish)
  useEffect(() => {
    if (!editor || !activeElement || !isPanelVisible) {
      setOpacity(0)
      return
    }
    
    // If we have a selected block, always show (selection takes priority)
    if (selectedBlock && selectedBlock.type === 'codeBlock' && selectedBlock.id === activeBlock?.id) {
      return
    }
    
    const checkFocus = () => {
      // Don't show if panel is not visible
      if (!isPanelVisible) {
        setOpacity(0)
        return
      }
      
      const isFocused = editor.isFocused?.() ?? document.activeElement?.closest('.bn-editor') !== null
      if (!isFocused && !hoveredBlockElement) {
        setOpacity(0)
      } else if ((isFocused || hoveredBlockElement) && blockRect && isPanelVisible) {
        // Restore opacity if we have focus or hover AND panel is visible
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
  }, [editor, hoveredBlockElement, activeElement, selectedBlock, activeBlock, blockRect, isPanelVisible])

  // Early return if panel is not visible - don't render button at all
  if (!isPanelVisible) return null
  
  if (!activeElement || !blockRect) return null

  // Double-check that the button position is actually within the visible editor
  const editorEl = document.querySelector('.bn-editor')
  if (!editorEl) return null
  
  const editorRect = editorEl.getBoundingClientRect()
  if (editorRect.width === 0 || editorRect.height === 0) return null
  
  // Check if NotesPanel container is visible
  const panelContainer = editorEl.closest('[data-panel-id]') || editorEl.closest('.bn-editor')?.parentElement
  if (panelContainer) {
    const panelRect = panelContainer.getBoundingClientRect()
    if (panelRect.width === 0 || panelRect.height === 0) return null
  }
  
  // Verify the code block is within editor bounds
  if (blockRect.right < editorRect.left || 
      blockRect.left > editorRect.right ||
      blockRect.bottom < editorRect.top ||
      blockRect.top > editorRect.bottom) {
    return null
  }

  // Header height is 50px - avoid overlapping with header
  const HEADER_HEIGHT = 50
  const buttonTop = blockRect.top + 4
  
  // If button would overlap with header, position it just below the header
  // Otherwise, keep it relative to the code block
  const finalTop = buttonTop < HEADER_HEIGHT 
    ? HEADER_HEIGHT + 8  // Position just below header
    : buttonTop

  // Ensure button is within editor bounds
  const buttonLeft = Math.min(blockRect.right - 28, editorRect.right - 32)
  if (buttonLeft < editorRect.left) return null

  // Final safety check - don't render if panel is not visible
  if (!isPanelVisible || opacity === 0) {
    return null
  }

  const toolbarStyle = {
    position: 'fixed',
    top: finalTop,
    left: buttonLeft,
    zIndex: 1000,
    opacity,
    transition: 'opacity 120ms ease',
    pointerEvents: opacity > 0 ? 'auto' : 'none',
    display: isPanelVisible && opacity > 0 ? 'block' : 'none', // Extra safety
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
      data-copy-button // Marker for hover detection
      onMouseEnter={() => {
        // Keep hover state when mouse enters button area
      }}
    >
      <button
        style={buttonStyle}
        onClick={handleCopy}
        title="Copy code"
        data-copy-button
      >
        <IconCopy size={14} />
      </button>
    </div>
  )
}

export default function NotesPanel({ docId }) {
  const [loading, setLoading] = useState(true)
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  const saveTimeout = useRef(null)
  const lastSavedContent = useRef(null)
  const whiteBackgroundRef = useRef(null)
  const [links, setLinks] = useState([]) // Store document/drawing links
  const [linkModalOpened, setLinkModalOpened] = useState(false)
  const [pendingLinkPosition, setPendingLinkPosition] = useState(null)
  const linkIdCounter = useRef(0) // Counter for generating unique link IDs
  const isAddingLinkRef = useRef(false) // Prevent multiple button creation
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()
  const { setEditor } = useEditor()
  const { project } = useProjectContext()
  const [showLinks] = useShowLinks()

  // Load content when docId changes or when auth state changes (user logs in/out)
  const { user } = useAuth()

  // Provide editor to context
  useEffect(() => {
    if (editor) {
      setEditor(editor)
    }
    return () => {
      setEditor(null)
    }
  }, [editor, setEditor])
  
  useEffect(() => {
    if (!docId) return
    setLoading(true)
    loadContent()
  }, [docId, user]) // Reload when docId or user (auth state) changes

  async function loadContent() {
    try {
      const content = await getDocumentContent(docId)
      if (!content) {
        setLoading(false)
        return
      }
      
      // Load notes content
      // Check if notes_content exists and is a valid array
      if (content.notes_content !== null && content.notes_content !== undefined) {
        if (Array.isArray(content.notes_content) && content.notes_content.length > 0) {
          editor.replaceBlocks(editor.document, content.notes_content)
          lastSavedContent.current = JSON.stringify(content.notes_content)
        } else if (Array.isArray(content.notes_content) && content.notes_content.length === 0) {
          // Empty array - set default blocks
          editor.replaceBlocks(editor.document, defaultBlocks)
          lastSavedContent.current = JSON.stringify(defaultBlocks)
        } else {
          // Invalid format - set default blocks
          editor.replaceBlocks(editor.document, defaultBlocks)
          lastSavedContent.current = JSON.stringify(defaultBlocks)
        }
      } else {
        // No notes_content - set default blocks
        editor.replaceBlocks(editor.document, defaultBlocks)
        lastSavedContent.current = JSON.stringify(defaultBlocks)
      }
      
      // Load document links
      if (content.document_links && Array.isArray(content.document_links)) {
        setLinks(content.document_links)
        // Update linkIdCounter to avoid ID conflicts
        if (content.document_links.length > 0) {
          const maxId = content.document_links.reduce((max, link) => {
            const match = link.id?.match(/link-(\d+)/)
            if (match) {
              const num = parseInt(match[1], 10)
              return Math.max(max, num)
            }
            return max
          }, 0)
          linkIdCounter.current = maxId + 1
        }
      } else {
        setLinks([])
      }
      
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
  
  async function saveLinks(linksToSave) {
    if (!docId) {
      return { success: false }
    }
    
    try {
      setIsSyncing(true)
      const result = await updateDocumentContent(docId, { document_links: linksToSave })
      
      if (result) {
        return result
      } else {
        return { success: false }
      }
    } catch (err) {
      console.error('Error saving links:', err)
      // If it's a schema cache issue, return error info
      if (err?.code === 'PGRST204') {
        return { success: false, document_links_skipped: true, error: 'PGRST204' }
      }
      return { success: false, error: err }
    } finally {
      setIsSyncing(false)
    }
  }
  
  function handleLinkSelected(selectedDocument, selectedProject) {
    if (!pendingLinkPosition || !selectedProject) return
    
    const buttonSize = 32
    const spacing = 4
    const position = pendingLinkPosition
    
    // Check if position would overlap
    if (checkOverlap(position.y, links, buttonSize, spacing)) {
      const adjustment = findNearestNonOverlappingY(position.y, links, buttonSize, spacing)
      if (adjustment !== null && Math.abs(adjustment) < buttonSize * 10) {
        createLink(selectedDocument, selectedProject, position, adjustment)
      }
    } else {
      createLink(selectedDocument, selectedProject, position, 0)
    }
    
    setPendingLinkPosition(null)
    setLinkModalOpened(false)
  }
  
  async function createLink(selectedDocument, selectedProject, position, adjustment) {
    const linkType = isDrawing(selectedDocument) ? 'drawing' : 'document'
    const newLink = {
      id: `link-${linkIdCounter.current++}`,
      targetDocumentId: selectedDocument.id,
      targetDocumentNumber: selectedDocument.document_number,
      targetProjectId: selectedProject.id,
      type: linkType,
      title: selectedDocument.title || (linkType === 'document' ? 'Untitled' : 'Untitled drawing'),
      x: position.x,
      y: position.y,
      adjustedY: adjustment,
      createdAt: new Date().toISOString(),
    }
    
    const updatedLinks = [...links, newLink]
    setLinks(updatedLinks)
    const result = await saveLinks(updatedLinks)
    
    // If save failed due to cache issue, remove the link from state
    if (result && result.document_links_skipped) {
      setLinks(links) // Revert to previous state
    }
  }
  
  async function handleDeleteLink(linkId) {
    const updatedLinks = links.filter(link => link.id !== linkId)
    setLinks(updatedLinks)
    const result = await saveLinks(updatedLinks)
    
    // If save failed due to cache issue, revert the deletion
    if (result && result.document_links_skipped) {
      setLinks(links) // Revert to previous state
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


  if (loading) {
    return (
      <Center style={{ height: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }

  return (
    <Box 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        position: 'relative',
        backgroundColor: colorScheme === 'dark' ? '#1a1b1e' : '#f8f9fa',
      }}
    >
      <Box 
        style={{ 
          flex: 1, 
          overflow: 'auto', 
          paddingTop: '48px',
          paddingLeft: '200px',
          paddingRight: '200px',
          paddingBottom: '48px',
          scrollbarWidth: 'none', /* Firefox */
          msOverflowStyle: 'none', /* IE and Edge */
        }}
        sx={{
          '&::-webkit-scrollbar': {
            display: 'none', /* Chrome, Safari, Opera */
          },
        }}
      >
        <Box
          ref={whiteBackgroundRef}
          style={{
            backgroundColor: colorScheme === 'dark' ? 'var(--mantine-color-dark-7)' : '#ffffff',
            minHeight: '1200px',
            paddingTop: '24px',
            paddingLeft: '16px',
            paddingRight: '24px',
            paddingBottom: '400px',
            border: colorScheme === 'dark' ? '1px solid var(--mantine-color-dark-4)' : '1px solid #e0e0e0',
            borderRadius: '5px',
            position: 'relative', // Make container relative for absolute positioned buttons
          }}
        >
          <Box
            style={{
              paddingLeft: '36px', // Extra left padding to make room for buttons (32px button + 8px gap - 4px spacing)
            }}
          >
            <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
          </Box>
          {showLinks && links.length > 0 && (
            <DocumentLinkButtons
              containerRef={whiteBackgroundRef}
              links={links}
              onDeleteLink={handleDeleteLink}
            />
          )}
        </Box>
        <FloatingCopyButton editor={editor} />
        {showLinks && (
          <FloatingLinkButton
            containerRef={whiteBackgroundRef}
            onLinkClick={(position) => {
              // Prevent multiple button creation
              if (isAddingLinkRef.current) return
              isAddingLinkRef.current = true

              // Store position and open modal
              setPendingLinkPosition(position)
              setLinkModalOpened(true)

              // Reset flag after a short delay
              setTimeout(() => {
                isAddingLinkRef.current = false
              }, 300)
            }}
          />
        )}
        <DocumentLinkModal
          opened={linkModalOpened}
          onClose={() => {
            setLinkModalOpened(false)
            setPendingLinkPosition(null)
          }}
          onSelectDocument={handleLinkSelected}
          currentDocumentId={docId ? docId : null}
        />
      </Box>
    </Box>
  )
}
