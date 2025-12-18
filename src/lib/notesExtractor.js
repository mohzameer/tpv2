/**
 * Extract notes summary from BlockNote blocks
 * Extracts text directly from blocks and truncates to maxLength
 */
export async function extractNotesSummary(blocks, maxLength = 500) {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return 'No notes content available'
  }

  try {
    let text = ''
    
    // Extract text from each block
    for (const block of blocks) {
      if (!block) continue
      
      // Handle different block types
      if (block.type === 'heading') {
        // Headings are important, prioritize them
        if (block.content) {
          if (Array.isArray(block.content)) {
            for (const item of block.content) {
              if (typeof item === 'string') {
                text += item + ' '
              } else if (item?.text) {
                text += item.text + ' '
              }
            }
          } else if (typeof block.content === 'string') {
            text += block.content + ' '
          }
        }
        text += '\n'
      } else if (block.content) {
        // Regular content (paragraphs, lists, etc.)
        if (Array.isArray(block.content)) {
          for (const item of block.content) {
            if (typeof item === 'string') {
              text += item + ' '
            } else if (item?.text) {
              text += item.text + ' '
            } else if (typeof item === 'object' && item !== null) {
              // Handle nested content
              if (item.content) {
                if (Array.isArray(item.content)) {
                  for (const subItem of item.content) {
                    if (typeof subItem === 'string') {
                      text += subItem + ' '
                    } else if (subItem?.text) {
                      text += subItem.text + ' '
                    }
                  }
                } else if (typeof item.content === 'string') {
                  text += item.content + ' '
                }
              }
            }
          }
        } else if (typeof block.content === 'string') {
          text += block.content + ' '
        }
        text += '\n'
      }
    }
    
    text = text.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ')
    
    if (!text || text.length === 0) {
      return 'No notes content available'
    }
    
    if (text.length <= maxLength) {
      return text
    }
    
    // Truncate at word boundary
    const truncated = text.substring(0, maxLength - 3)
    const lastSpace = truncated.lastIndexOf(' ')
    return lastSpace > 0 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...'
  } catch (error) {
    console.error('Failed to extract notes summary:', error)
    return 'No notes content available'
  }
}
