const LAST_VISITED_KEY = 'thinkpost_last_visited'

export function getLastVisited() {
  const stored = localStorage.getItem(LAST_VISITED_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function setLastVisited(projectId, docId) {
  localStorage.setItem(LAST_VISITED_KEY, JSON.stringify({ projectId, docId }))
}
