# Specification: Custom Code Block with Copy Button

## Version
0.1.0

## Date
2024-12-17

## Overview
Create a custom code block for BlockNote that:
1. Fixes copy behavior (no escaping when copying code content)
2. Adds a copy button in the top-right corner of code blocks
3. Maintains compatibility with BlockNote's node tracking system

## Goals
1. Custom code block that works with BlockNote's internal systems
2. Copy button visible on all code blocks
3. Plain text copying without escaping
4. No "Cannot find node position" errors
5. Maintains all default code block functionality

## Non-Goals
- Syntax highlighting (can be added later)
- Language detection
- Line numbers
- Code execution

---

## Research: BlockNote Custom Block Architecture

### Key Concepts

1. **BlockNote Block Structure**:
   - Blocks are defined using `createReactBlockSpec` (factory function)
   - Returns a factory that creates a `BlockSpec` when called
   - `BlockSpec` has `config` and `implementation` properties

2. **Block Configuration (`CustomBlockConfig`)**:
   ```typescript
   {
     type: string,           // Unique block type identifier
     propSchema: object,     // Properties the block supports
     content: "inline" | "none"  // Content type
   }
   ```

3. **Block Implementation (`ReactCustomBlockImplementation`)**:
   ```typescript
   {
     render: (props) => ReactElement,  // How block renders
     toExternalHTML?: (props) => ReactElement,  // For clipboard/export
     parse?: (element) => Block,       // For parsing HTML
   }
   ```

4. **Render Props**:
   ```typescript
   {
     block: Block,           // Block data
     editor: BlockNoteEditor, // Editor instance
     contentRef: RefCallback // Must attach to editable content element
   }
   ```

### Critical Requirements

1. **`contentRef` Must Be Attached Correctly**:
   - For inline content blocks, `contentRef` must be on the element where BlockNote injects content
   - This is how BlockNote tracks node positions
   - If `contentRef` is missing or on wrong element → "Cannot find node position" error

2. **Factory Function Pattern**:
   - `createReactBlockSpec()` returns a factory function
   - Must call the factory: `CustomBlock()` to get `BlockSpec`
   - `BlockSpec` has `.config` and `.implementation` properties

3. **Default Block Access**:
   - `defaultBlockSpecs.codeBlock` might be:
     - A factory function (needs `codeBlock()`)
     - A `BlockSpec` object (has `.config` and `.implementation`)
   - Need to handle both cases

---

## Implementation Approaches

### Approach 1: Extend Default Code Block (Recommended)

**Strategy**: Use default code block's implementation and only customize what we need.

**Pros**:
- Leverages BlockNote's tested code block implementation
- Less code to maintain
- Lower risk of breaking node tracking

**Cons**:
- Depends on default block structure
- Less control over rendering

**Implementation Steps**:
1. Extract default `codeBlock` from `defaultBlockSpecs`
2. Determine if it's a factory or spec object
3. Get the `BlockSpec` (call factory if needed)
4. Use `createReactBlockSpec` with:
   - Spread `...codeBlockSpec.config` for config
   - Spread `...codeBlockSpec.implementation` for implementation
   - Override `toExternalHTML` for plain text copy
   - Override `render` to add copy button wrapper

**Code Structure**:
```javascript
// Extract and get default code block spec
const codeBlockSpec = typeof codeBlock === 'function' 
  ? codeBlock() 
  : codeBlock

// Create custom version
const CustomCodeBlock = createReactBlockSpec(
  {
    ...codeBlockSpec.config,  // Use default config
  },
  {
    ...codeBlockSpec.implementation,  // Use default implementation
    render: (props) => {
      // Wrap default render with copy button
      const DefaultRender = codeBlockSpec.implementation.render
      return (
        <div style={{ position: 'relative' }}>
          <DefaultRender {...props} />
          <CopyButton block={props.block} />
        </div>
      )
    },
    toExternalHTML: ({ block }) => {
      // Return plain text for clipboard
      const plainText = extractPlainText(block)
      return <pre><code>{plainText}</code></pre>
    },
  }
)
```

### Approach 2: Create From Scratch

**Strategy**: Build a completely custom code block.

**Pros**:
- Full control
- No dependencies on default implementation

**Cons**:
- More code to write
- Higher risk of node tracking issues
- Need to replicate all default functionality

**Implementation Steps**:
1. Define block config from scratch
2. Implement render function with proper `contentRef` usage
3. Implement `toExternalHTML` for copy
4. Ensure `contentRef` is on correct element

**Code Structure**:
```javascript
const CustomCodeBlock = createReactBlockSpec(
  {
    type: 'codeBlock',
    propSchema: {
      language: { default: 'plain text' },
    },
    content: 'inline',
  },
  {
    render: ({ block, contentRef }) => {
      // CRITICAL: contentRef must be on the code element
      return (
        <div style={{ position: 'relative' }}>
          <pre>
            <code ref={contentRef} />
          </pre>
          <CopyButton block={block} />
        </div>
      )
    },
    toExternalHTML: ({ block }) => {
      const plainText = extractPlainText(block)
      return <pre><code>{plainText}</code></pre>
    },
  }
)
```

### Approach 3: DOM Manipulation (Not Recommended)

**Strategy**: Keep default code block, add copy buttons via DOM manipulation.

**Pros**:
- No interference with BlockNote internals
- Simple to implement

**Cons**:
- Fragile (depends on DOM structure)
- Not React-idiomatic
- Hard to maintain
- Copy buttons might not persist

---

## Recommended Implementation Plan

### Phase 1: Research Default Code Block Structure

1. **Inspect `defaultBlockSpecs.codeBlock`**:
   - Check if it's a function or object
   - If function, call it and inspect returned `BlockSpec`
   - Document the structure of `config` and `implementation`

2. **Test Default Render**:
   - See how default code block renders
   - Identify where `contentRef` is attached
   - Understand the DOM structure

### Phase 2: Implement Copy Button Component

1. **Create `CopyButton` Component**:
   ```javascript
   function CopyButton({ block }) {
     const plainText = extractPlainText(block)
     
     const handleCopy = async () => {
       await navigator.clipboard.writeText(plainText)
     }
     
     return (
       <button
         onClick={handleCopy}
         style={{ position: 'absolute', top: 4, right: 4 }}
       >
         Copy
       </button>
     )
   }
   ```

2. **Extract Plain Text Helper**:
   ```javascript
   function extractPlainText(block) {
     if (!block?.content) return ''
     return block.content
       .map((inline) => {
         if (typeof inline === 'string') return inline
         if (typeof inline === 'object' && inline.text) return inline.text
         return ''
       })
       .join('')
   }
   ```

### Phase 3: Customize Code Block

1. **Use Approach 1 (Extend Default)**:
   - Extract default code block spec
   - Create custom version with copy button wrapper
   - Customize `toExternalHTML` for plain text

2. **Test Node Tracking**:
   - Verify no "Cannot find node position" errors
   - Test editing code blocks
   - Test copy functionality

### Phase 4: Integration

1. **Update Schema**:
   ```javascript
   const schema = BlockNoteSchema.create({
     blockSpecs: {
       ...markdownBlocks,
       codeBlock: CustomCodeBlock(),  // Override default
     },
   })
   ```

2. **Test**:
   - Create code blocks
   - Edit code blocks
   - Copy code blocks (button and select+copy)
   - Verify no escaping in clipboard

---

## Implementation Details

### Helper Functions

**Extract Plain Text**:
```javascript
function getCodeBlockPlainText(block) {
  if (!block?.content) return ''
  return block.content
    .map((inline) => {
      if (typeof inline === 'string') return inline
      if (typeof inline === 'object' && inline.text) return inline.text
      return ''
    })
    .join('')
}
```

**Copy to Clipboard**:
```javascript
async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
```

### Copy Button Component

```javascript
function CodeBlockCopyButton({ block, onCopy }) {
  const plainText = getCodeBlockPlainText(block)
  
  const handleClick = async (e) => {
    e.stopPropagation()
    e.preventDefault()
    await copyToClipboard(plainText)
    onCopy?.()
  }
  
  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 4,
        border: '1px solid rgba(0,0,0,0.2)',
        background: 'rgba(255,255,255,0.9)',
        cursor: 'pointer',
        zIndex: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }}
    >
      Copy
    </button>
  )
}
```

---

## Testing Requirements

### Unit Tests

1. **Block Creation**:
   - Custom code block can be created
   - Schema includes custom code block
   - No errors when initializing editor

2. **Rendering**:
   - Code blocks render correctly
   - Copy button appears
   - No "Cannot find node position" errors

3. **Copy Functionality**:
   - Copy button copies plain text
   - Select+copy also works (via toExternalHTML)
   - No escaping in clipboard content

### Manual Testing

- [ ] Create code block
- [ ] Edit code block content
- [ ] Click copy button → verify clipboard has plain text
- [ ] Select code block text and copy → verify no escaping
- [ ] Test with various code content (special chars, newlines, etc.)
- [ ] Verify no console errors
- [ ] Test in different browsers

---

## Success Criteria

1. ✅ Custom code block works without errors
2. ✅ Copy button appears on all code blocks
3. ✅ Copy button copies plain text (no escaping)
4. ✅ Select+copy also works (via toExternalHTML)
5. ✅ No "Cannot find node position" errors
6. ✅ Code blocks are editable
7. ✅ All default code block functionality preserved

---

## Implementation Notes

### Key Learnings from Previous Attempts

1. **`contentRef` is Critical**:
   - Must be attached to the element where BlockNote injects inline content
   - Usually the `<code>` element for code blocks
   - Wrong placement causes node tracking errors

2. **Factory Function Pattern**:
   - `createReactBlockSpec` returns a factory
   - Must call factory to get `BlockSpec`
   - `BlockSpec` has `.config` and `.implementation`

3. **Default Block Access**:
   - `defaultBlockSpecs.codeBlock` structure varies
   - Need to handle both function and object cases

4. **Wrapper Elements**:
   - Can wrap default render in additional elements
   - But `contentRef` must still be on correct element
   - Position relative wrapper for absolute button positioning

### Potential Issues

1. **Node Tracking Errors**:
   - If `contentRef` not properly attached
   - If block structure doesn't match BlockNote's expectations
   - Solution: Use default render and wrap it

2. **Copy Button Not Visible**:
   - Z-index issues
   - Parent container not positioned relative
   - Solution: Ensure proper CSS positioning

3. **Copy Still Escapes**:
   - `toExternalHTML` not working correctly
   - Browser clipboard handling
   - Solution: Return plain text in `<pre><code>` tags

---

## Next Steps

1. Research default code block structure
2. Implement helper functions
3. Create copy button component
4. Implement custom code block (Approach 1)
5. Test thoroughly
6. Iterate based on results
