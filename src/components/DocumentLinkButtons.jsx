import { useState, useMemo } from 'react'
import { IconFile, IconBrush, IconTrash, IconArrowRight } from '@tabler/icons-react'
import { Menu, useMantineTheme } from '@mantine/core'
import { useTheme } from '../context/ThemeContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useProjectContext } from '../context/ProjectContext'
import { setLastVisitedDocumentNumber } from '../lib/lastVisited'

// Individual link button component
function LinkButton({ link, containerRef, onDelete, index }) {
  const { colorScheme } = useTheme()
  const mantineTheme = useMantineTheme()
  const [isHovered, setIsHovered] = useState(false)
  const navigate = useNavigate()
  const { project } = useProjectContext()
  
  const handleNavigate = () => {
    if (!project || !link.targetDocumentNumber) return
    
    // Store document number
    setLastVisitedDocumentNumber(project.id, link.targetDocumentNumber)
    
    // Navigate to linked document
    navigate(`/${project.id}/${link.targetDocumentNumber}`)
  }
  
  const handleDelete = () => {
    onDelete(link.id)
  }

  if (!containerRef?.current) return null

  const buttonSize = 32
  const gap = 8

  // Calculate button position relative to container (absolute positioning)
  // Position inside the container, hugging the left border
  // Only vertical adjustment (no horizontal stacking)
  const adjustedY = link.adjustedY || 0
  const buttonLeft = gap // Position inside, hugging the left border
  const buttonTop = link.y + adjustedY - buttonSize / 2 // Position relative to container top

  const primaryColor = mantineTheme.colors[mantineTheme.primaryColor][6] // Main primary color
  const primaryColorHover = mantineTheme.colors[mantineTheme.primaryColor][7] // Darker for hover
  const primaryColorLight = mantineTheme.colors[mantineTheme.primaryColor][4] // Lighter variant

  const buttonStyle = {
    position: 'absolute',
    left: `${buttonLeft}px`,
    top: `${buttonTop}px`,
    width: `${buttonSize}px`,
    height: `${buttonSize}px`,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: `1px solid ${isHovered ? primaryColorHover : primaryColor}`,
    background: isHovered
      ? primaryColorHover
      : primaryColor,
    cursor: 'pointer',
    boxShadow: isHovered
      ? `0 2px 8px ${primaryColor}40`
      : `0 1px 4px ${primaryColor}30`,
    opacity: isHovered ? 1 : 0.9,
    transition: 'opacity 150ms ease, background 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
    zIndex: 10, // Lower than modals (200) but above normal content
    pointerEvents: 'auto',
  }

  const iconSize = 18
  const iconColor = '#ffffff' // White icons on primary color background

  const isInvalid = !link.targetDocumentId || !link.targetDocumentNumber

  return (
    <Menu shadow="md" position="right-start" withArrow>
      <Menu.Target>
        <button
          style={buttonStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          title={link.type === 'document' ? `Document: ${link.title || 'Untitled'}` : `Drawing: ${link.title || 'Untitled'}`}
          data-link-button-id={link.id}
        >
          {link.type === 'document' ? (
            <IconFile size={iconSize} color={iconColor} />
          ) : (
            <IconBrush size={iconSize} color={iconColor} />
          )}
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {link.type === 'document' ? (
            <IconFile size={14} style={{ display: 'inline', marginRight: '4px' }} />
          ) : (
            <IconBrush size={14} style={{ display: 'inline', marginRight: '4px' }} />
          )}
          {link.title || 'Untitled'}
        </Menu.Label>
        <Menu.Item
          leftSection={<IconArrowRight size={14} />}
          onClick={handleNavigate}
          disabled={isInvalid}
        >
          Go to document
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconTrash size={14} />}
          color="red"
          onClick={handleDelete}
        >
          Delete link
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

// Helper function to get actual Y position of a link (original + adjustment)
function getActualY(link) {
  return link.y + (link.adjustedY || 0)
}

// Helper function to check if a Y position would overlap with existing buttons
export function checkOverlap(y, existingLinks, buttonSize, spacing) {
  if (!existingLinks || existingLinks.length === 0) return false
  
  const minVerticalSpacing = buttonSize + spacing
  return existingLinks.some((link) => {
    const linkY = getActualY(link)
    return Math.abs(linkY - y) < minVerticalSpacing
  })
}

// Helper function to find nearest non-overlapping Y position
// Returns the adjustment needed (adjustedY), or null if no position found
export function findNearestNonOverlappingY(y, existingLinks, buttonSize, spacing) {
  if (!checkOverlap(y, existingLinks, buttonSize, spacing)) {
    return 0 // No overlap, no adjustment needed
  }

  const minVerticalSpacing = buttonSize + spacing
  const searchRadius = 20 // Maximum number of button sizes to search
  let bestAdjustment = null
  let minDistance = Infinity

  // Try positions above and below
  for (let offset = 1; offset <= searchRadius; offset++) {
    // Try above
    const testYAbove = y - offset * minVerticalSpacing
    if (!checkOverlap(testYAbove, existingLinks, buttonSize, spacing)) {
      const distance = Math.abs(testYAbove - y)
      if (distance < minDistance) {
        minDistance = distance
        bestAdjustment = testYAbove - y
      }
    }

    // Try below
    const testYBelow = y + offset * minVerticalSpacing
    if (!checkOverlap(testYBelow, existingLinks, buttonSize, spacing)) {
      const distance = Math.abs(testYBelow - y)
      if (distance < minDistance) {
        minDistance = distance
        bestAdjustment = testYBelow - y
      }
    }
  }

  return bestAdjustment
}

// Main component to manage all document/drawing link buttons
export default function DocumentLinkButtons({ containerRef, links, onAddLink, onDeleteLink }) {
  const { colorScheme } = useTheme()
  const buttonSize = 32
  const spacing = 4 // Spacing between buttons

  // Simply use links as-is (they should already be positioned correctly)
  // No automatic repositioning - buttons are added only if they don't overlap
  const positionedLinks = useMemo(() => {
    if (!links || links.length === 0) return []
    
    // Sort by Y position for consistent rendering
    return [...links].sort((a, b) => {
      const aY = a.y + (a.adjustedY || 0)
      const bY = b.y + (b.adjustedY || 0)
      return aY - bY
    })
  }, [links])

  if (!containerRef?.current || !links || links.length === 0) return null

  // Render buttons inside the container so they scroll with it
  return (
    <>
      {positionedLinks.map((link, index) => {
        return (
          <LinkButton
            key={link.id}
            link={link}
            containerRef={containerRef}
            onDelete={onDeleteLink}
            index={index}
          />
        )
      })}
    </>
  )
}
