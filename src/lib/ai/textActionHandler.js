/**
 * Text Action Handler - Processing text insertion requests from AI
 * 
 * This module handles:
 * - Detecting when AI wants to add text to notes
 * - Extracting text content from AI responses
 */

/**
 * Extract JSON from AI response
 * Handles markdown code blocks and plain JSON
 */
function extractJSONFromResponse(responseText) {
  if (!responseText) return null

  try {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }

    // Try to find JSON object in text
    const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      return JSON.parse(jsonObjectMatch[0])
    }

    // Try parsing the whole response as JSON
    return JSON.parse(responseText)
  } catch (error) {
    return null
  }
}

/**
 * Check if response contains a text insertion action
 */
export function isTextInsertAction(responseData) {
  return responseData && responseData.action === 'insert_text'
}

/**
 * Extract text content from action
 */
export function extractTextContent(responseData) {
  if (!isTextInsertAction(responseData)) return null
  return responseData.text || null
}

/**
 * Process AI response for text insertion
 * 
 * @param {string} responseText - Raw AI response text
 * @returns {Object|null} Text insertion data or null
 */
export function processTextInsertion(responseText) {
  const jsonData = extractJSONFromResponse(responseText)
  
  if (!jsonData || !isTextInsertAction(jsonData)) {
    return null
  }

  const text = extractTextContent(jsonData)
  if (!text) return null

  return {
    action: 'insert_text',
    text: text,
    blockType: jsonData.blockType || 'paragraph', // paragraph, heading, etc.
    level: jsonData.level || 1, // for headings
  }
}
