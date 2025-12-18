/**
 * Excalidraw Parser - Understanding and parsing Excalidraw elements
 * 
 * This module handles:
 * - Extracting information from Excalidraw elements
 * - Creating summaries for AI context
 * - Understanding element structure and relationships
 */

/**
 * Extract a summary of Excalidraw drawing content for AI context
 * Includes element positions, labels, and relationships
 */
export function extractDrawingSummary(drawingContent) {
  if (!drawingContent || !drawingContent.elements || !Array.isArray(drawingContent.elements)) {
    return 'No drawing content available'
  }

  const elements = drawingContent.elements
  if (elements.length === 0) {
    return 'No drawing content available'
  }

  const shapes = []
  const arrows = []

  for (const el of elements) {
    const type = el.type || 'unknown'
    
    if (['rectangle', 'ellipse', 'diamond'].includes(type)) {
      const label = el.text || el.label?.text || 'unnamed'
      const centerX = el.x + (el.width || 0) / 2
      const centerY = el.y + (el.height || 0) / 2
      shapes.push({
        id: el.id,
        type,
        label,
        x: Math.round(el.x),
        y: Math.round(el.y),
        centerX: Math.round(centerX),
        centerY: Math.round(centerY),
        width: el.width,
        height: el.height,
      })
    } else if (type === 'arrow' || type === 'line') {
      const startX = el.x + (el.points?.[0]?.[0] || 0)
      const startY = el.y + (el.points?.[0]?.[1] || 0)
      const endX = el.x + (el.points?.[el.points.length - 1]?.[0] || 0)
      const endY = el.y + (el.points?.[el.points.length - 1]?.[1] || 0)
      arrows.push({
        id: el.id,
        startX: Math.round(startX),
        startY: Math.round(startY),
        endX: Math.round(endX),
        endY: Math.round(endY),
        startBinding: el.startBinding,
        endBinding: el.endBinding,
      })
    } else if (type === 'text') {
      shapes.push({
        id: el.id,
        type: 'text',
        label: el.text || '',
        x: Math.round(el.x),
        y: Math.round(el.y),
        centerX: Math.round(el.x + (el.width || 0) / 2),
        centerY: Math.round(el.y + (el.height || 0) / 2),
      })
    }
  }

  let summary = `Drawing has ${elements.length} element(s). `
  
  if (shapes.length > 0) {
    summary += `Shapes (${shapes.length}): `
    summary += shapes.map(s => `"${s.label}" (${s.type}) at (${s.centerX}, ${s.centerY})`).join(', ')
    summary += '. '
  }
  
  if (arrows.length > 0) {
    summary += `Arrows (${arrows.length}): connecting elements. `
  }

  return summary
}

/**
 * Get element center coordinates
 */
export function getElementCenter(element) {
  if (!element) return null
  
  const centerX = element.x + (element.width || 0) / 2
  const centerY = element.y + (element.height || 0) / 2
  
  return { x: centerX, y: centerY }
}

/**
 * Check if an element is a shape (can be bound to arrows)
 */
export function isShapeElement(element) {
  return element && ['rectangle', 'ellipse', 'diamond', 'text'].includes(element.type)
}

/**
 * Get element label text
 */
export function getElementLabel(element) {
  if (!element) return ''
  return element.text || element.label?.text || ''
}

/**
 * Find element by label (case-insensitive, partial match)
 */
export function findElementByLabel(drawingContent, labelText) {
  if (!drawingContent || !drawingContent.elements || !Array.isArray(drawingContent.elements)) {
    return null
  }

  const searchLabel = labelText.toLowerCase().trim()

  for (const el of drawingContent.elements) {
    const elementLabel = getElementLabel(el).toLowerCase().trim()
    
    // Exact match or contains match
    if (elementLabel === searchLabel || elementLabel.includes(searchLabel) || searchLabel.includes(elementLabel)) {
      return el
    }
  }

  return null
}

/**
 * Get all elements with their labels for easy lookup
 */
export function getElementsByLabel(drawingContent) {
  if (!drawingContent || !drawingContent.elements || !Array.isArray(drawingContent.elements)) {
    return []
  }

  return drawingContent.elements
    .filter(el => isShapeElement(el))
    .map(el => ({
      element: el,
      label: getElementLabel(el),
      center: getElementCenter(el),
    }))
    .filter(item => item.label && item.label.trim() !== '')
}
