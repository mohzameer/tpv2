/**
 * Document type detection and utilities
 */

/**
 * Get document type from a document object
 * @param {Object} document - Document object with document_type and/or title
 * @returns {string} - 'text' or 'drawing'
 */
export function getDocumentType(document) {
  if (!document) return 'text'
  
  // Primary: check document_type field
  if (document.document_type) {
    return document.document_type
  }
  
  // Fallback: check name pattern (for backward compatibility during migration)
  if (document.title?.toLowerCase().startsWith('drawing-')) {
    return 'drawing'
  }
  
  // Default
  return 'text'
}

/**
 * Check if a document is a drawing
 * @param {Object} document - Document object
 * @returns {boolean}
 */
export function isDrawing(document) {
  return getDocumentType(document) === 'drawing'
}

/**
 * Check if a document is a text document
 * @param {Object} document - Document object
 * @returns {boolean}
 */
export function isText(document) {
  return getDocumentType(document) === 'text'
}
