import { Box, Text, Tooltip } from '@mantine/core'
import { IconPhoto, IconFileText } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useProjectContext } from '../context/ProjectContext'

/**
 * Visual badge/indicator for diagram placeholders while editing
 * Shows whether a document was found or not, and allows navigation
 */
export default function DiagramPlaceholderBadge({ drawingKey, found, format = 'block', targetDoc = null }) {
  const navigate = useNavigate()
  const { project } = useProjectContext()
  
  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (found && targetDoc && project && targetDoc.document_number) {
      navigate(`/${project.id}/${targetDoc.document_number}`)
    }
  }
  
  const getTooltipLabel = () => {
    if (!found) {
      return `Document not found: ${drawingKey}`
    }
    if (targetDoc) {
      const docType = targetDoc.document_type === 'drawing' ? 'Drawing' : 'Text document'
      return `${docType}: ${targetDoc.title} (#${targetDoc.document_number}) - Click to open`
    }
    return `Document: ${drawingKey}`
  }
  
  const isClickable = found && targetDoc && project && targetDoc.document_number
  
  if (format === 'inline') {
    // Inline badges are smaller and less intrusive
    return (
      <Tooltip label={getTooltipLabel()}>
        <Box
          component="span"
          onClick={isClickable ? handleClick : undefined}
          style={{
            display: 'inline-block',
            padding: '1px 4px',
            margin: '0 2px',
            backgroundColor: found ? '#e3f2fd' : '#ffebee',
            color: found ? '#1976d2' : '#c62828',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: 500,
            verticalAlign: 'middle',
            cursor: isClickable ? 'pointer' : 'help',
            transition: isClickable ? 'opacity 0.2s' : 'none',
          }}
          onMouseEnter={(e) => {
            if (isClickable) {
              e.currentTarget.style.opacity = '0.8'
            }
          }}
          onMouseLeave={(e) => {
            if (isClickable) {
              e.currentTarget.style.opacity = '1'
            }
          }}
        >
          {targetDoc?.document_type === 'drawing' ? '📊' : '📄'}
        </Box>
      </Tooltip>
    )
  }
  
  // Block format badge
  const Icon = targetDoc?.document_type === 'drawing' ? IconPhoto : IconFileText
  
  return (
    <Tooltip label={getTooltipLabel()}>
      <Box
        onClick={isClickable ? handleClick : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          margin: '0 4px',
          backgroundColor: found ? '#e3f2fd' : '#ffebee',
          color: found ? '#1976d2' : '#c62828',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 500,
          cursor: isClickable ? 'pointer' : 'help',
          transition: isClickable ? 'opacity 0.2s, transform 0.1s' : 'none',
        }}
        onMouseEnter={(e) => {
          if (isClickable) {
            e.currentTarget.style.opacity = '0.8'
            e.currentTarget.style.transform = 'scale(1.05)'
          }
        }}
        onMouseLeave={(e) => {
          if (isClickable) {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.transform = 'scale(1)'
          }
        }}
      >
        <Icon size={12} />
        <Text size="xs" fw={500}>
          {targetDoc?.title || drawingKey}
          {targetDoc?.document_number && ` (#${targetDoc.document_number})`}
        </Text>
      </Box>
    </Tooltip>
  )
}
