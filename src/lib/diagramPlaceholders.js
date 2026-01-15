/**
 * Diagram Placeholder Utilities
 * 
 * Functions for parsing diagram placeholders from BlockNote blocks
 * and finding corresponding drawing documents.
 */

/**
 * Extract plain text from a BlockNote block
 * @param {Object} block - BlockNote block
 * @returns {string} Plain text content
 */
export function getBlockPlainText(block) {
  if (!block?.content) return ''
  
  if (Array.isArray(block.content)) {
    return block.content
      .map(item => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item.text) return item.text
        return ''
      })
      .join('')
  }
  
  if (typeof block.content === 'string') {
    return block.content
  }
  
  return ''
}

/**
 * Extract diagram placeholders from a BlockNote block
 * @param {Object} block - BlockNote block
 * @returns {Array} Array of placeholder objects: [{ blockId, drawingKey, format, startIndex, endIndex }]
 */
export function extractDiagramPlaceholders(block) {
  const placeholders = []
  
  if (!block) return placeholders
  
  // Get plain text content
  const text = getBlockPlainText(block)
  if (!text) return placeholders
  
  // Match block-level: :::diagram key:::
  const blockRegex = /:::diagram\s+([\w-]+):::/g
  let match
  while ((match = blockRegex.exec(text)) !== null) {
    placeholders.push({
      blockId: block.id,
      drawingKey: match[1],
      format: 'block',
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      fullMatch: match[0]
    })
  }
  
  // Match inline: [diagram:key]
  const inlineRegex = /\[diagram:([\w-]+)\]/g
  while ((match = inlineRegex.exec(text)) !== null) {
    placeholders.push({
      blockId: block.id,
      drawingKey: match[1],
      format: 'inline',
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      fullMatch: match[0]
    })
  }
  
  return placeholders
}

/**
 * Find a document by key (title, number, or ID).
 * This supports ANY document type. Callers can decide
 * how to treat text vs drawing documents.
 * @param {Array} documents - All documents in the project
 * @param {string} key - Diagram key to match
 * @returns {Object|null} Matching document or null
 */
export function findDocumentByKey(documents, key) {
  if (!documents || !key) return null
  
  // Normalize key for comparison
  const normalizedKey = key.toLowerCase().trim()
  
  // Try matching by document number (if key is numeric)
  if (/^\d+$/.test(normalizedKey)) {
    const docNumber = parseInt(normalizedKey, 10)
    const byNumber = documents.find(d => d.document_number === docNumber)
    if (byNumber) return byNumber
  }
  
  // Try matching by document ID (exact match)
  const byId = documents.find(d => d.id === key)
  if (byId) return byId
  
  // Try matching by title (normalized, case-insensitive, exact match)
  const byTitle = documents.find(d => {
    const normalizedTitle = (d.title || '').toLowerCase().trim()
    return normalizedTitle === normalizedKey
  })
  if (byTitle) return byTitle
  
  // Try partial title match (if exact match fails)
  // Remove common prefixes like "drawing-", "diagram-"
  const byPartialTitle = documents.find(d => {
    const normalizedTitle = (d.title || '').toLowerCase().trim()
    const cleanTitle = normalizedTitle.replace(/^(drawing|diagram)-/, '')
    return cleanTitle === normalizedKey || normalizedTitle.includes(normalizedKey)
  })
  if (byPartialTitle) return byPartialTitle
  
  return null
}

/**
 * Extract all diagram placeholders from a BlockNote document
 * @param {Array} blocks - BlockNote document blocks
 * @returns {Array} Array of all placeholders with block context
 */
export function extractAllPlaceholders(blocks) {
  if (!blocks || !Array.isArray(blocks)) return []
  
  const allPlaceholders = []
  
  blocks.forEach(block => {
    const placeholders = extractDiagramPlaceholders(block)
    placeholders.forEach(ph => {
      allPlaceholders.push({
        ...ph,
        block
      })
    })
  })
  
  return allPlaceholders
}

/**
 * Create a render map for all placeholders in a document
 * @param {Array} blocks - BlockNote document blocks
 * @param {Array} documents - All documents in the project
 * @returns {Map} Map of blockId -> { placeholders: [...], renderData: [...] }
 */
export function createDiagramRenderMap(blocks, documents) {
  const map = new Map()
  
  if (!blocks || !Array.isArray(blocks)) return map
  
  blocks.forEach(block => {
    const placeholders = extractDiagramPlaceholders(block)
    if (placeholders.length === 0) return
    
    const renderData = placeholders.map(ph => {
      const doc = findDocumentByKey(documents, ph.drawingKey)
      const result = {
        ...ph,
        targetDocId: doc?.id || null,
        targetDoc: doc || null,
        isDrawing: doc?.document_type === 'drawing',
        found: !!doc
      }
      return result
    })
    
    map.set(block.id, { 
      placeholders, 
      renderData,
      block
    })
  })
  
  return map
}
