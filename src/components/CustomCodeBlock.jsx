import { createReactBlockSpec } from '@blocknote/react'
import { defaultBlockSpecs } from '@blocknote/core'

// Helper to extract plain text from code block's inline content
export function getCodeBlockPlainText(block) {
  if (!block?.content) return ''
  return block.content
    .map((inline) => {
      if (typeof inline === 'string') return inline
      if (typeof inline === 'object' && inline.text) return inline.text
      return ''
    })
    .join('')
}

// Copy button component
function CopyButton({ block, editor }) {
  const handleCopy = async () => {
    try {
      const textToCopy = getCodeBlockPlainText(block)
      if (!textToCopy.trim()) {
        console.warn('No text to copy from code block')
        return
      }
      
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
        // Visual feedback could be added here
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea')
        textarea.value = textToCopy
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch (err) {
      console.error('Failed to copy code block:', err)
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        handleCopy()
      }}
      style={{
        position: 'absolute',
        top: '4px',
        right: '4px',
        fontSize: '11px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid rgba(0,0,0,0.2)',
        background: 'rgba(255,255,255,0.95)',
        cursor: 'pointer',
        zIndex: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }}
    >
      Copy
    </button>
  )
}

// Get the default code block
const defaultCodeBlock = defaultBlockSpecs.codeBlock

// Try to get default spec to extract config
let defaultConfig = null
try {
  if (typeof defaultCodeBlock === 'function') {
    const spec = defaultCodeBlock()
    defaultConfig = spec?.config
  } else if (defaultCodeBlock?.config) {
    defaultConfig = defaultCodeBlock.config
  }
} catch (err) {
  // Ignore - we'll use fallback config
}

// Create custom code block with copy button in render
export const CustomCodeBlock = createReactBlockSpec(
  {
    type: 'codeBlock',
    propSchema: defaultConfig?.propSchema || {
      language: {
        default: 'plain text',
      },
    },
    content: 'inline',
  },
  {
    // Render with copy button - contentRef MUST be on the code element
    render: ({ block, editor, contentRef }) => {
      return (
        <div style={{ position: 'relative' }}>
          <pre style={{ margin: 0, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', overflow: 'auto' }}>
            <code ref={contentRef} style={{ fontFamily: 'monospace', fontSize: '14px', display: 'block', whiteSpace: 'pre' }} />
          </pre>
          <CopyButton block={block} editor={editor} />
        </div>
      )
    },
    // Customize toExternalHTML to return plain text (no escaping)
    toExternalHTML: ({ block }) => {
      const plainText = getCodeBlockPlainText(block)
      return (
        <pre>
          <code>{plainText}</code>
        </pre>
      )
    },
  }
)
