const LAST_VISITED_KEY = 'thinkpost_last_visited'

// Get last visited project and document (for backward compatibility)
export function getLastVisited() {
  const stored = localStorage.getItem(LAST_VISITED_KEY)
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    // Support both old format {projectId, docId} and new format {lastProjectId, lastDocId, projects: {projectId: docId}}
    if (data.projectId && data.docId) {
      return { projectId: data.projectId, docId: data.docId }
    }
    if (data.lastProjectId && data.lastDocId) {
      return { projectId: data.lastProjectId, docId: data.lastDocId }
    }
    return null
  } catch {
    return null
  }
}

// Get last visited document for a specific project
export function getLastDocumentForProject(projectId) {
  const stored = localStorage.getItem(LAST_VISITED_KEY)
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    // Check new format first
    if (data.projects && data.projects[projectId]) {
      return data.projects[projectId]
    }
    // Fallback to old format if it matches
    if (data.projectId === projectId && data.docId) {
      return data.docId
    }
    return null
  } catch {
    return null
  }
}

// Set last visited project and document
export function setLastVisited(projectId, docId) {
  const stored = localStorage.getItem(LAST_VISITED_KEY)
  let data = {}
  
  if (stored) {
    try {
      data = JSON.parse(stored)
    } catch {
      data = {}
    }
  }
  
  // Store per-project last document
  if (!data.projects) {
    data.projects = {}
  }
  data.projects[projectId] = docId
  
  // Also store as the global last visited (for backward compatibility)
  data.lastProjectId = projectId
  data.lastDocId = docId
  
  // Keep old format for backward compatibility
  data.projectId = projectId
  data.docId = docId
  
  localStorage.setItem(LAST_VISITED_KEY, JSON.stringify(data))
}
