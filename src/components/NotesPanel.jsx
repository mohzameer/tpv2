import { Box, Loader, Center } from '@mantine/core'
import { IconCopy } from '@tabler/icons-react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './NotesPanel.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useAuth } from '../context/AuthContext'
import { useEditor } from '../context/EditorContext'
import { useProjectContext } from '../context/ProjectContext'
import { createDiagramRenderMap, getBlockPlainText } from '../lib/diagramPlaceholders'
import DiagramRenderer from './DiagramRenderer'
import DiagramPlaceholderBadge from './DiagramPlaceholderBadge'

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

// Component to render diagrams from placeholders
// Renders diagrams as separate React components positioned after their blocks
function DiagramPlaceholderRenderer({ editor, documents }) {
  const [renderedDiagrams, setRenderedDiagrams] = useState(new Map())
  const renderedDiagramsRef = useRef(new Map())
  const diagramRenderMapRef = useRef(new Map())
  const lastDocumentStringRef = useRef('')
  const lastDocumentsStringRef = useRef('')
  
  // Update render map only when document or documents actually change
  useEffect(() => {
    if (!editor?.document || !documents) {
      diagramRenderMapRef.current = new Map()
      return
    }
    
    // Create stable string representations for comparison
    const docString = JSON.stringify(editor.document)
    const docsString = JSON.stringify(documents.map(d => ({ 
      id: d.id, 
      title: d.title, 
      document_type: d.document_type, 
      document_number: d.document_number 
    })))
    
    // Only recalculate if content actually changed
    if (docString !== lastDocumentStringRef.current || 
        docsString !== lastDocumentsStringRef.current) {
      diagramRenderMapRef.current = createDiagramRenderMap(editor.document, documents)
      lastDocumentStringRef.current = docString
      lastDocumentsStringRef.current = docsString
    }
  }, [editor?.document, documents])
  
  const diagramRenderMap = diagramRenderMapRef.current
  
  useEffect(() => {
    const diagramRenderMap = diagramRenderMapRef.current
    if (!editor || diagramRenderMap.size === 0) {
      // Clean up all containers
      renderedDiagramsRef.current.forEach(({ container }) => {
        if (container.parentNode) {
          container.parentNode.removeChild(container)
        }
      })
      renderedDiagramsRef.current.clear()
      setRenderedDiagrams(new Map())
      return
    }
    
    const updateDiagrams = () => {
      const editorEl = document.querySelector('.bn-editor')
      if (!editorEl) {
        console.log('[DiagramPlaceholder] No editor element found')
        return
      }
      
      const diagramRenderMap = diagramRenderMapRef.current
      console.log('[DiagramPlaceholder] Render map size:', diagramRenderMap.size)
      
      const newRenderedDiagrams = new Map()
      
      // Process each placeholder - search for text directly in DOM
      diagramRenderMap.forEach(({ placeholders, renderData, block }, blockId) => {
        console.log('[DiagramPlaceholder] Processing block:', blockId, 'placeholders:', placeholders.length)
        
        placeholders.forEach((ph, index) => {
          const { targetDocId, targetDoc, isDrawing, found, format, drawingKey } = renderData[index]
          const diagramKey = `${blockId}-${index}-${drawingKey}`
          const placeholderText = format === 'block' 
            ? `:::diagram ${drawingKey}:::`
            : `[diagram:${drawingKey}]`
          
          // Check if container already exists
          const existingContainer = editorEl.querySelector(`[data-diagram-container="${diagramKey}"]`)
          if (existingContainer) {
            console.log('[DiagramPlaceholder] Container already exists for:', diagramKey)
            newRenderedDiagrams.set(diagramKey, {
              container: existingContainer,
              docId: targetDocId || null,
              targetDoc: targetDoc || null,
              isDrawing: !!isDrawing,
              format,
              drawingKey,
              blockId,
              found
            })
            return
          }
          
          // Search for any element containing the placeholder text
          const allElements = editorEl.querySelectorAll('*')
          let targetElement = null
          
          for (const el of allElements) {
            if (el.textContent && el.textContent.includes(placeholderText)) {
              // Check if this is a paragraph or block-level element
              if (format === 'block' && (el.tagName === 'P' || el.getAttribute('data-node-type') === 'paragraph')) {
                if (el.textContent.trim() === placeholderText.trim() || el.textContent.includes(placeholderText)) {
                  targetElement = el
                  break
                }
              } else if (format === 'inline') {
                targetElement = el
                break
              }
            }
          }
          
          if (!targetElement) {
            console.log('[DiagramPlaceholder] Could not find element containing:', placeholderText)
            return
          }
          
          console.log('[DiagramPlaceholder] Found target element:', targetElement, 'text:', targetElement.textContent?.substring(0, 100))
          
          // Create container
          const container = document.createElement('div')
          container.setAttribute('data-diagram-container', diagramKey)
          container.setAttribute('data-diagram-key', drawingKey)
          container.setAttribute('data-format', format)
          
          if (found && isDrawing && targetDocId) {
            container.style.cssText = format === 'block' 
              ? 'width: 100%; margin: 16px 0;'
              : 'display: inline-block; margin: 0 4px; vertical-align: middle;'
          } else {
            container.style.cssText = format === 'block' 
              ? 'display: inline-block; margin: 8px 0;'
              : 'display: inline-block; margin: 0 4px; vertical-align: middle;'
          }
          
          // Insert container
          if (format === 'block' && targetElement.tagName === 'P' && targetElement.textContent.trim() === placeholderText.trim()) {
            // Replace entire paragraph
            targetElement.innerHTML = ''
            targetElement.appendChild(container)
            console.log('[DiagramPlaceholder] Replaced paragraph with container')
          } else {
            // Insert after target element
            if (targetElement.parentNode) {
              targetElement.parentNode.insertBefore(container, targetElement.nextSibling)
              console.log('[DiagramPlaceholder] Inserted container after element')
            }
            
            // Hide the placeholder text
            if (targetElement.tagName === 'P' && targetElement.textContent.trim() === placeholderText.trim()) {
              targetElement.style.display = 'none'
            }
          }
          
          newRenderedDiagrams.set(diagramKey, {
            container,
            docId: targetDocId || null,
            targetDoc: targetDoc || null,
            isDrawing: !!isDrawing,
            format,
            drawingKey,
            blockId,
            found
          })
        })
      })
        
        placeholders.forEach((ph, index) => {
          const { targetDocId, targetDoc, isDrawing, found, format, drawingKey } = renderData[index]
          const diagramKey = `${blockId}-${index}-${drawingKey}`
          
          // Check if placeholder text exists in the block
          const placeholderText = format === 'block' 
            ? `:::diagram ${drawingKey}:::`
            : `[diagram:${drawingKey}]`
          
          const blockText = blockEl.textContent || ''
          if (!blockText.includes(placeholderText)) {
            console.log('[DiagramPlaceholder] Placeholder text not found. Looking for:', placeholderText, 'in:', blockText.substring(0, 100))
            return
          }
          
          console.log('[DiagramPlaceholder] Found placeholder:', placeholderText, 'in block')
          
          // Check if we've already created a container for this diagram/badge/link
          let container = blockEl.querySelector(`[data-diagram-container="${diagramKey}"]`)
          
          if (!container) {
            // Create container element
            container = document.createElement('div')
            container.setAttribute('data-diagram-container', diagramKey)
            container.setAttribute('data-diagram-key', drawingKey)
            container.setAttribute('data-format', format)
            
            if (found && isDrawing && targetDocId) {
              // Render embedded diagram for drawing documents
              container.style.cssText = format === 'block' 
                ? 'width: 100%; margin: 16px 0;'
                : 'display: inline-block; margin: 0 4px; vertical-align: middle;'
            } else {
              // Render badge for missing or non-drawing documents
              container.style.cssText = format === 'block' 
                ? 'display: inline-block; margin: 8px 0;'
                : 'display: inline-block; margin: 0 4px; vertical-align: middle;'
            }
            
            // Insert container right after the block element
            // For block format, try to replace the text in the paragraph
            if (format === 'block') {
              // Find the paragraph element containing the placeholder
              const paragraphEl = blockEl.querySelector('p') || (blockEl.tagName === 'P' ? blockEl : null)
              
              if (paragraphEl && paragraphEl.textContent.trim() === placeholderText.trim()) {
                // If the paragraph is ONLY the placeholder, replace it entirely
                console.log('[DiagramPlaceholder] Replacing entire paragraph with container')
                paragraphEl.innerHTML = ''
                paragraphEl.appendChild(container)
              } else {
                // Otherwise, insert after the block
                console.log('[DiagramPlaceholder] Inserting container after block')
                if (blockEl.parentNode) {
                  blockEl.parentNode.insertBefore(container, blockEl.nextSibling)
                } else {
                  blockEl.appendChild(container)
                }
                
                // Try to hide the placeholder text
                const walker = document.createTreeWalker(
                  blockEl,
                  NodeFilter.SHOW_TEXT,
                  null
                )
                
                let textNode = walker.nextNode()
                while (textNode) {
                  if (textNode.textContent.includes(placeholderText)) {
                    const parent = textNode.parentNode
                    if (parent && parent.tagName === 'P' && parent.textContent.trim() === placeholderText.trim()) {
                      parent.style.display = 'none'
                      console.log('[DiagramPlaceholder] Hid paragraph containing placeholder')
                    }
                    break
                  }
                  textNode = walker.nextNode()
                }
              }
            } else {
              // For inline, insert after the block
              if (blockEl.parentNode) {
                blockEl.parentNode.insertBefore(container, blockEl.nextSibling)
              } else {
                blockEl.appendChild(container)
              }
            }
            
            console.log('[DiagramPlaceholder] Container created and inserted:', container, 'parent:', container.parentNode)
          }
          
          newRenderedDiagrams.set(diagramKey, {
            container,
            docId: targetDocId || null,
            targetDoc: targetDoc || null,
            isDrawing: !!isDrawing,
            format,
            drawingKey,
            blockId,
            found
          })
        })
      })
      
      // Remove diagrams that are no longer needed
      renderedDiagramsRef.current.forEach(({ container }, key) => {
        if (!newRenderedDiagrams.has(key) && container.parentNode) {
          container.parentNode.removeChild(container)
        }
      })
      
      // Only update state if something actually changed
      const currentKeys = Array.from(renderedDiagramsRef.current.keys()).sort().join(',')
      const newKeys = Array.from(newRenderedDiagrams.keys()).sort().join(',')
      
      if (currentKeys !== newKeys || renderedDiagramsRef.current.size !== newRenderedDiagrams.size) {
        renderedDiagramsRef.current = new Map(newRenderedDiagrams)
        setRenderedDiagrams(new Map(newRenderedDiagrams))
      }
    }
    
    // Run update after a delay to ensure DOM is ready
    const timeoutId = setTimeout(updateDiagrams, 200)
    
    // Watch for DOM changes
    const editorEl = document.querySelector('.bn-editor')
    if (!editorEl) {
      return () => clearTimeout(timeoutId)
    }
    
    let isUpdating = false
    const observer = new MutationObserver(() => {
      if (isUpdating) return
      isUpdating = true
      clearTimeout(timeoutId)
      setTimeout(() => {
        updateDiagrams()
        isUpdating = false
      }, 100)
    })
    
    observer.observe(editorEl, { 
      childList: true, 
      subtree: true,
      characterData: true
    })
    
    // Listen to editor changes (debounced)
    let changeTimeout = null
    const unsubscribe = editor.onChange(() => {
      if (changeTimeout) clearTimeout(changeTimeout)
      changeTimeout = setTimeout(() => {
        if (!isUpdating) {
          updateDiagrams()
        }
      }, 300)
    })
    
    return () => {
      clearTimeout(timeoutId)
      if (changeTimeout) clearTimeout(changeTimeout)
      observer.disconnect()
      unsubscribe()
    }
  }, [editor, documents])
  
  // Render diagrams or badges into containers using portals
  return (
    <>
      {Array.from(renderedDiagrams.entries()).map(([key, { container, docId, targetDoc, isDrawing, format, drawingKey, found }]) => {
        if (!container) return null
        
        // Render embedded diagram for drawing documents
        if (found && isDrawing && docId) {
          return createPortal(
            <DiagramRenderer 
              key={key}
              drawingDocId={docId} 
              format={format}
            />,
            container
          )
        } else {
          // Render badge for missing or non-drawing document references
          return createPortal(
            <DiagramPlaceholderBadge 
              key={key}
              drawingKey={drawingKey}
              found={found}
              format={format}
              targetDoc={targetDoc}
            />,
            container
          )
        }
      })}
    </>
  )
}

export default function NotesPanel({ docId }) {
  const [loading, setLoading] = useState(true)
  const editor = useCreateBlockNote({ schema, initialContent: defaultBlocks })
  const saveTimeout = useRef(null)
  const lastSavedContent = useRef(null)
  const { colorScheme } = useTheme()
  const { setIsSyncing } = useSync()
  const { setEditor } = useEditor()
  const { documents } = useProjectContext()

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
      if (content?.notes_content && Array.isArray(content.notes_content) && content.notes_content.length > 0) {
        editor.replaceBlocks(editor.document, content.notes_content)
        lastSavedContent.current = JSON.stringify(content.notes_content)
      } else {
        // Set default blocks for new document
        editor.replaceBlocks(editor.document, defaultBlocks)
        lastSavedContent.current = JSON.stringify(defaultBlocks)
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
          style={{
            backgroundColor: colorScheme === 'dark' ? 'var(--mantine-color-dark-7)' : '#ffffff',
            minHeight: '1200px',
            paddingTop: '24px',
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: '400px',
            border: colorScheme === 'dark' ? '1px solid var(--mantine-color-dark-4)' : '1px solid #e0e0e0',
            borderRadius: '5px',
          }}
        >
          <BlockNoteView editor={editor} theme={colorScheme} onChange={handleChange} />
          <DiagramPlaceholderRenderer editor={editor} documents={documents} />
        </Box>
        <FloatingCopyButton editor={editor} />
      </Box>
    </Box>
  )
}
