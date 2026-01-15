import { useState, useEffect, useRef } from 'react'
import { IconLink } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'

// Floating link button component - follows cursor in white background area
export default function FloatingLinkButton({ containerRef, onLinkClick }) {
  const [mousePosition, setMousePosition] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [clickPosition, setClickPosition] = useState(null)
  const rafRef = useRef(null)
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const hideTimeoutRef = useRef(null)
  const { colorScheme } = useTheme()

  // Track mouse position globally, with tolerance zone around white background container
  useEffect(() => {
    if (!containerRef?.current) return

    const container = containerRef.current
    const buttonSize = 36
    const gap = 8
    const toleranceZone = 100 // Pixels outside container where button should still be visible

    const updatePosition = (mouseX, mouseY) => {
      if (rafRef.current) return

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null

        const rect = container.getBoundingClientRect()
        
        // Extended tolerance zone - especially to the left where button is positioned
        const extendedLeft = rect.left - buttonSize - gap - toleranceZone
        const extendedRight = rect.right + toleranceZone
        const extendedTop = rect.top - toleranceZone
        const extendedBottom = rect.bottom + toleranceZone

        // Check if mouse is within the extended tolerance zone
        const isInToleranceZone =
          mouseX >= extendedLeft &&
          mouseX <= extendedRight &&
          mouseY >= extendedTop &&
          mouseY <= extendedBottom

        // Check if mouse is within the actual container
        const isInside =
          mouseX >= rect.left &&
          mouseX <= rect.right &&
          mouseY >= rect.top &&
          mouseY <= rect.bottom

        if (isInside) {
          // Clear any pending hide timeout
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
            hideTimeoutRef.current = null
          }

          // Calculate position relative to container
          const relativeX = mouseX - rect.left
          const relativeY = mouseY - rect.top
          setMousePosition({ x: relativeX, y: relativeY })
          setIsVisible(true)
          lastMousePosRef.current = { x: mouseX, y: mouseY }
        } else if (isInToleranceZone) {
          // Mouse is in tolerance zone - continue following cursor
          // Clear any pending hide timeout
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
            hideTimeoutRef.current = null
          }
          
          // Calculate position relative to container and continue following
          const relativeX = mouseX - rect.left
          const relativeY = mouseY - rect.top
          
          // Update position to follow cursor even in tolerance zone
          setMousePosition({ x: relativeX, y: relativeY })
          setIsVisible(true)
          lastMousePosRef.current = { x: mouseX, y: mouseY }
        } else {
          // Mouse is far away - hide after a short delay
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
          }
          hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false)
            setMousePosition(null)
            hideTimeoutRef.current = null
          }, 200) // 200ms delay before hiding
        }
      })
    }

    // Track mouse movement globally
    const onMouseMove = (e) => {
      updatePosition(e.clientX, e.clientY)
    }

    // Update position on scroll
    const onScroll = () => {
      if (lastMousePosRef.current.x && lastMousePosRef.current.y) {
        updatePosition(lastMousePosRef.current.x, lastMousePosRef.current.y)
      }
    }

    // Track mouse leaving the document entirely
    const onMouseLeave = (e) => {
      if (!e.relatedTarget) {
        // Mouse left the window
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
        }
        setIsVisible(false)
        setMousePosition(null)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [containerRef])

  // Handle click to capture position
  const handleClick = (e) => {
    if (!containerRef?.current || !mousePosition) return

    e.preventDefault()
    e.stopPropagation()

    // Store click position (relative to container)
    setClickPosition({ ...mousePosition })

    // Call callback if provided
    if (onLinkClick) {
      onLinkClick(mousePosition)
    }

    // Log for debugging (can be removed later)
    console.log('Link button clicked at position:', mousePosition)
  }

  // Early return if not visible
  if (!isVisible || !mousePosition || !containerRef?.current) return null

  const containerRect = containerRef.current.getBoundingClientRect()
  const buttonSize = 36 // Increased from 24 to 36
  const gap = 8

  // Calculate button position
  // Left: outside the left edge of container
  let buttonLeft = containerRect.left - buttonSize - gap
  // Top: centered on cursor Y position, but constrained to container bounds
  let buttonTop = containerRect.top + mousePosition.y - buttonSize / 2

  // Constrain button to stay within white background container's vertical bounds
  const minTop = containerRect.top
  const maxTop = containerRect.bottom - buttonSize
  const constrainedTop = Math.max(minTop, Math.min(buttonTop, maxTop))
  
  // Ensure button doesn't go off the left edge of viewport
  const constrainedLeft = Math.max(0, buttonLeft)
  
  // If button would be off-screen to the left, hide it
  if (buttonLeft < 0) return null
  
  // If cursor is outside container bounds, don't show button
  if (mousePosition.y < 0 || mousePosition.y > containerRect.height) return null

  const buttonStyle = {
    position: 'fixed',
    left: constrainedLeft,
    top: constrainedTop,
    width: `${buttonSize}px`,
    height: `${buttonSize}px`,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px', // Slightly larger border radius for bigger button
    border: `1px solid ${colorScheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
    background: isHovered
      ? colorScheme === 'dark'
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(0,0,0,0.08)'
      : colorScheme === 'dark'
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.04)',
    cursor: 'pointer',
    boxShadow: isHovered
      ? '0 2px 8px rgba(0,0,0,0.15)'
      : '0 1px 3px rgba(0,0,0,0.1)',
    opacity: isHovered ? 1 : 0.5,
    transition: 'opacity 150ms ease, background 150ms ease, box-shadow 150ms ease',
    zIndex: 999,
    pointerEvents: 'auto',
  }

  return (
    <button
      style={buttonStyle}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Link document or drawing"
      data-link-button
    >
      <IconLink
        size={20} // Increased from 14 to 20
        color={
          isHovered
            ? colorScheme === 'dark'
              ? '#ffffff'
              : '#000000'
            : colorScheme === 'dark'
            ? 'rgba(255,255,255,0.6)'
            : 'rgba(0,0,0,0.5)'
        }
      />
    </button>
  )
}
