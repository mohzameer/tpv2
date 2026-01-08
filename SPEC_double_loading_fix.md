# Specification: Fix Double Loading Issue in DrawingPanel

## Problem
When loading the drawing editor, the component shows a loading indicator, then nothing, then the indicator again, and finally the editor appears. This is caused by the component unmounting and remounting unnecessarily.

## Root Cause Analysis
From logs, the sequence is:
1. `DocumentPage` renders `WorkspacePanel` when `loaded = true`
2. `DocumentPage`'s `useEffect` schedules `loadLayout()` with 300ms delay
3. `loadLayout()` sets `loaded = false` → causes unmount
4. `loadLayout()` completes → sets `loaded = true` → causes remount
5. Remount triggers `DrawingPanel`'s `useEffect` → calls `loadContent` again

The issue: `loadLayout()` always sets `loaded = false` even when already loaded, causing unnecessary unmount/remount.

## Proposed Solutions

### Solution 1: Only set loaded=false when docId actually changes
**Approach**: Track the previous docId and only reset `loaded` when switching to a different document.

**Implementation**:
- Add a ref to track previous docId
- In `loadLayout()`, only set `loaded = false` if `docId !== previousDocId`
- Update ref after loading completes

**Pros**:
- Minimal change
- Prevents unnecessary unmount when same docId
- Still handles document switching correctly

**Cons**:
- Still might unmount on initial load (but that's expected)

**Expected Result**: 
- First load: Shows loader once (expected)
- Switching documents: Shows loader once per switch (expected)
- No double loading on same document

---

### Solution 2: Prevent loadLayout() from running if already loaded for current docId
**Approach**: Track which docId is currently loaded and skip `loadLayout()` if it's already loaded.

**Implementation**:
- Add a ref to track `loadedDocId`
- In `useEffect`, check if `docId === loadedDocId` before calling `loadLayout()`
- Update `loadedDocId` after successful load

**Pros**:
- Prevents unnecessary API calls
- Prevents unnecessary state changes
- More efficient

**Cons**:
- Might need to handle edge cases (e.g., force reload)
- Slightly more complex logic

**Expected Result**:
- First load: Shows loader once
- Switching documents: Shows loader once per switch
- No redundant `loadLayout()` calls for same docId

---

### Solution 3: Initialize loaded=true by default, only set false when necessary
**Approach**: Start with `loaded = true` and only set to `false` when we actually need to reload.

**Implementation**:
- Change initial state: `const [loaded, setLoaded] = useState(true)`
- Only set `loaded = false` when docId changes or when we need to force reload
- This prevents the initial "not loaded" state that causes unmount

**Pros**:
- Simplest change
- Prevents initial unmount
- Component stays mounted during layout loading

**Cons**:
- Might show stale content briefly during load
- Need to ensure we handle the loading state properly in child components

**Expected Result**:
- Component stays mounted during layout load
- No unmount/remount cycle
- Single load per document

---

## Testing Plan

For each solution:
1. Test initial document load - should show loader once
2. Test switching between documents - should show loader once per switch
3. Test switching back to previous document - should show loader once
4. Check console logs - should see single `loadContent` call per mount
5. Verify no double loading indicator flash

## Recommendation

Start with **Solution 1** as it's the most targeted fix with minimal risk. If that doesn't fully solve it, try **Solution 3** as it's simpler and addresses the root cause more directly.
