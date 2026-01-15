# Specification: Floating Link Button for Documents/Drawings

## Overview
Add a floating button that appears to the left of the white background (document content area) in the NotesPanel. The button follows the cursor vertically as it moves through the document area, allowing users to link documents or drawings at specific positions.

## Requirements

### Visual Design
1. **Button Appearance**
   - Icon: Use a link/drawing icon (e.g., `IconLink` or `IconBrush` from @tabler/icons-react)
   - Default state: Grayed out (low opacity, muted colors)
   - Hover state: Highlighted (increased opacity, more visible)
   - Size: Small, compact button (similar to FloatingCopyButton - ~24px)

2. **Positioning**
   - Position: Fixed to the left side of the white background area
   - Vertical alignment: Follows cursor Y position as it moves through the document
   - Horizontal offset: Outside the left edge of the white background (with small gap)
   - Only visible when cursor is within the white background area

3. **Styling**
   - Default: `opacity: 0.4-0.5`, muted gray colors
   - Hover: `opacity: 1.0`, more vibrant colors, subtle shadow
   - Smooth transitions for opacity and color changes
   - Cursor: `pointer` on hover

### Behavior

1. **Visibility**
   - Only appears when mouse is over the white background container
   - Hides when mouse leaves the white background area
   - Smooth fade in/out transitions

2. **Mouse Tracking**
   - Track mouse position within the white background container
   - Update button vertical position in real-time as cursor moves
   - Use `requestAnimationFrame` for smooth updates

3. **Click Handling**
   - On click, capture the click position relative to the white background
   - Store position data: `{ x, y }` coordinates
   - Position should be relative to the white background container (not viewport)
   - This position data will be used later for displaying document/drawing icons

### Technical Implementation

1. **Component Structure**
   - Create new component: `FloatingLinkButton`
   - Add to NotesPanel, similar to FloatingCopyButton
   - Use refs to track white background container element

2. **State Management**
   - Track mouse position: `{ x: number, y: number }`
   - Track visibility: `boolean`
   - Track click position: `{ x: number, y: number } | null` (for future use)

3. **Event Handlers**
   - `onMouseMove`: Update button position
   - `onMouseEnter`: Show button
   - `onMouseLeave`: Hide button
   - `onClick`: Capture click position

4. **Position Calculation**
   - Get white background container bounds using `getBoundingClientRect()`
   - Calculate button position:
     - `left`: `containerRect.left - buttonWidth - gap`
     - `top`: `mouseY - buttonHeight / 2` (centered on cursor)
   - Ensure button stays within viewport bounds

### Integration Points

1. **NotesPanel Component**
   - Add FloatingLinkButton component
   - Pass necessary props (project context, document context if needed)
   - Ensure it doesn't interfere with existing FloatingCopyButton

2. **Future Extensions**
   - Click position data will be used to:
     - Display document icons at clicked positions
     - Display drawing icons at clicked positions
     - Allow navigation to linked documents/drawings
   - Position data structure should be extensible for future features

### Edge Cases

1. **Viewport Boundaries**
   - Button should not go above viewport top
   - Button should not go below viewport bottom
   - Adjust position if it would overflow

2. **Panel Visibility**
   - Hide button when NotesPanel is not visible
   - Hide button when white background container is not visible

3. **Performance**
   - Throttle/debounce mouse move events using `requestAnimationFrame`
   - Avoid unnecessary re-renders

4. **Multiple Buttons**
   - Ensure FloatingLinkButton doesn't conflict with FloatingCopyButton
   - Different positioning to avoid overlap

## Implementation Details

### Component Props
```javascript
FloatingLinkButton({
  // Container ref for white background area
  containerRef: RefObject,
  // Optional: callback when button is clicked
  onLinkClick?: (position: { x: number, y: number }) => void
})
```

### State Structure
```javascript
{
  mousePosition: { x: number, y: number } | null,
  isVisible: boolean,
  clickPosition: { x: number, y: number } | null
}
```

### CSS Classes
- `.floating-link-button`: Main button container
- `.floating-link-button--visible`: Visible state
- `.floating-link-button--hover`: Hover state

## Future Enhancements

1. **Icon Stacking**
   - When multiple documents/drawings are linked at similar positions
   - Stack icons vertically or show count badge

2. **Visual Feedback**
   - Show tooltip on hover: "Link document or drawing"
   - Animate button appearance/disappearance

3. **Keyboard Shortcuts**
   - Optional: Keyboard shortcut to trigger link action

4. **Link Management**
   - Modal/dropdown to select document/drawing to link
   - Visual indicators showing existing links

## Testing Considerations

1. **Mouse Movement**
   - Button follows cursor smoothly
   - No jitter or lag

2. **Visibility**
   - Button appears/disappears correctly
   - Works when panel is resized

3. **Click Handling**
   - Position is captured accurately
   - Position is relative to white background container

4. **Edge Cases**
   - Works at viewport edges
   - Works when scrolling
   - Works when panel is hidden/shown
