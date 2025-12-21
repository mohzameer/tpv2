import { getUserLastVisited, setUserLastVisited as setUserLastVisitedDB } from './api'
import { supabase } from './supabase'

const LAST_VISITED_KEY = 'thinkpost_last_visited'

// Get last visited project and document
// For logged-in users: fetch from database
// For guests: use localStorage
export async function getLastVisited() {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    // For logged-in users, get from database
    try {
      return await getUserLastVisited()
    } catch (err) {
      console.error('Failed to get last visited from database:', err)
      // Fallback to localStorage
    }
  }
  
  // For guests or if DB fetch fails, use localStorage
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
// For logged-in users: save to database
// For guests: save to localStorage
export async function setLastVisited(projectId, docId) {
  console.log('setLastVisited called:', { projectId, docId, projectIdType: typeof projectId, docIdType: typeof docId })
  const { data: { user } } = await supabase.auth.getUser()
  console.log('setLastVisited: User:', user ? { id: user.id, email: user.email } : 'NOT LOGGED IN')
  
  if (user) {
    // For logged-in users, save to database
    try {
      console.log('setLastVisited: Saving to database for user:', user.id)
      await setUserLastVisitedDB(projectId, docId)
      console.log('setLastVisited: Successfully saved to database')
    } catch (err) {
      console.error('setLastVisited: Failed to save last visited to database:', err)
      // Fallback to localStorage
    }
  } else {
    console.log('setLastVisited: No user, saving to localStorage only')
  }
  
  // Always update localStorage (for guests and as fallback)
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
  
  console.log('setLastVisited: Saving to localStorage:', { projectId, docId, fullData: data })
  localStorage.setItem(LAST_VISITED_KEY, JSON.stringify(data))
  console.log('setLastVisited: localStorage updated')
}
