import { useState, useEffect, useRef } from 'react'
import { getProjects, createProject, getDocuments, createDocument, deleteProject, getProjectById } from '../lib/api'
import { getLastVisited, getLastDocumentNumberForProject, setLastVisitedDocumentNumber } from '../lib/lastVisited'
import { supabase } from '../lib/supabase'

export function useProject() {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const switchingRef = useRef(false)
  const lastUserIdRef = useRef(null) // Track last user ID to detect actual user changes
  const initialLoadRef = useRef(false) // Track if initial load has completed

  useEffect(() => {
    initProject()
    initialLoadRef.current = true
    
    // Reload projects when auth state changes (e.g., after login or logout)
    // Only reload on SIGNED_IN or SIGNED_OUT events, not on TOKEN_REFRESHED
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id || null
      const userIdChanged = lastUserIdRef.current !== currentUserId
      
      // Update last user ID
      lastUserIdRef.current = currentUserId
      
      // Only reload if we're not in the middle of switching projects
      // For SIGNED_IN events after initial load, only reload if user actually changed
      // This prevents reloads on session recovery (tab becoming visible)
      if (!switchingRef.current && (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && (userIdChanged || !initialLoadRef.current)))) {
        // Reload projects on login/logout to ensure proper scoping
        initProject()
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])

  async function resetProject() {
    setLoading(true)
    try {
      // Delete existing projects
      const projects = await getProjects()
      for (const p of projects) {
        await deleteProject(p.id)
      }
      // Create fresh project
      const newProject = await createProject('My Project')
      const newDoc = await createDocument(newProject.id, 'Untitled')
      setProject(newProject)
      setDocuments([newDoc])
      return { project: newProject, doc: newDoc }
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setLoading(false)
    }
  }

  async function initProject() {
    // Don't run if we're in the middle of switching projects
    if (switchingRef.current) {
      return
    }

    setLoading(true)
    try {
      let projects = await getProjects()
      console.log('[useProject] Available projects:', projects.length, projects.map(p => ({ id: p.id, name: p.name })))
      
      // Create default project if none exists (for first-time users/guests)
      // This ensures guest users get a project on first root URL load
      if (projects.length === 0) {
        const newProject = await createProject('My Project')
        projects = [newProject]
      }

      // Priority 0: Check URL first - if we're on a project route, use that project
      // This prevents flickering when switching projects
      const pathname = window.location.pathname
      const urlProjectId = pathname.split('/').filter(Boolean)[0] // Get first path segment (projectId)
      
      // If current project already matches URL, don't change it (prevents flickering)
      if (project && project.id === urlProjectId) {
        setLoading(false)
        return
      }
      
      let currentProject = projects[0]
      let foundUrlProject = false
      
      if (urlProjectId && urlProjectId !== 'login' && urlProjectId !== 'settings') {
        const urlProject = projects.find(p => p.id === urlProjectId)
        if (urlProject) {
          currentProject = urlProject
          foundUrlProject = true
        } else {
          // Project not in user's project list - check if it exists and what its ownership is
          // This handles the case where a guest tries to access a project that belongs to a signed-in user
          const { data: { user } } = await supabase.auth.getUser()
          const projectData = await getProjectById(urlProjectId)
          
          if (projectData) {
            // Project exists but is not in user's list
            if (!user && projectData.owner_id) {
              // Guest trying to access a project owned by a signed-in user
              // Don't allow access - this would orphan the project
              console.warn('[useProject] Guest user cannot access project owned by signed-in user:', urlProjectId)
              // Fall back to first available project
            } else if (user && projectData.owner_id !== user.id) {
              // Signed-in user trying to access a project owned by another user
              // Don't allow access
              console.warn('[useProject] User cannot access project owned by another user:', urlProjectId)
              // Fall back to first available project
            } else {
              // Project exists and user has access, but it's not in the filtered list
              // This shouldn't happen, but if it does, we'll use the first available project
              console.warn('[useProject] Project exists but not in filtered list:', urlProjectId)
            }
          }
          // If project doesn't exist or user doesn't have access, fall back to first available project
        }
      }

      // Priority 1: Check localStorage for guest project (user might have just logged in and claimed it)
      // Only if we didn't find a project in the URL
      if (!foundUrlProject) {
        const LAST_VISITED_KEY = 'thinkpost_last_visited'
        const stored = localStorage.getItem(LAST_VISITED_KEY)
        let guestProjectId = null
        let foundGuestProject = false
        
        if (stored) {
          try {
            const data = JSON.parse(stored)
            guestProjectId = data.projectId || data.lastProjectId
          } catch (e) {
            // Could not parse localStorage
          }
        }
        
        // If we have a guest project ID and it exists in projects (was just claimed), use it
        // This takes priority over database last visited because it's what the user was just working on
        if (guestProjectId) {
          const claimedProject = projects.find(p => p.id === guestProjectId)
          if (claimedProject) {
            currentProject = claimedProject
            foundGuestProject = true
          }
        }
        
        // Priority 2: Check for last visited project from database (ONLY if we didn't find a guest project)
        // This is for returning users who didn't just log in
        if (!foundGuestProject) {
          const lastVisited = await getLastVisited()
          if (lastVisited?.projectId) {
            const lastProject = projects.find(p => p.id === lastVisited.projectId)
            if (lastProject) {
              currentProject = lastProject
            }
          }
        }
      }

      setProject(currentProject)
      console.log('[useProject] Selected project:', currentProject.id, currentProject.name)

      // Load documents
      let docs = await getDocuments(currentProject.id)
      console.log('[useProject] Loaded documents for project', currentProject.id, ':', docs.length, docs)
      
      // Create default document if none exists
      if (docs.length === 0) {
        console.log('[useProject] No documents found, creating default document')
        const newDoc = await createDocument(currentProject.id, 'Untitled')
        docs = [newDoc]
      }

      setDocuments(docs)
    } catch (err) {
      console.error('Failed to init project:', err)
    } finally {
      setLoading(false)
    }
  }

  async function addDocument(title = 'Untitled', documentType = 'text') {
    if (!project) return
    const doc = await createDocument(project.id, title, documentType)
    setDocuments((prev) => [...prev, doc])
    return doc
  }

  async function refreshDocuments() {
    if (!project) return
    const docs = await getDocuments(project.id)
    setDocuments(docs)
  }

  async function switchProject(projectId) {
    // Set flag to prevent initProject from running during switch
    switchingRef.current = true
    setLoading(true)
    try {
      const projects = await getProjects()
      const targetProject = projects.find(p => p.id === projectId)
      if (!targetProject) {
        // Project not in user's list - check if it exists and verify ownership
        const { data: { user } } = await supabase.auth.getUser()
        const projectData = await getProjectById(projectId)
        
        if (projectData) {
          // Project exists but is not in user's list
          if (!user && projectData.owner_id) {
            // Guest trying to access a project owned by a signed-in user
            console.warn('[useProject] Guest user cannot switch to project owned by signed-in user:', projectId)
            setLoading(false)
            switchingRef.current = false
            return null
          } else if (user && projectData.owner_id !== user.id) {
            // Signed-in user trying to access a project owned by another user
            console.warn('[useProject] User cannot switch to project owned by another user:', projectId)
            setLoading(false)
            switchingRef.current = false
            return null
          }
        }
        
        // Project doesn't exist or user doesn't have access
        setLoading(false)
        switchingRef.current = false
        return null
      }
      
      setProject(targetProject)
      
      let docs = await getDocuments(targetProject.id)
      if (docs.length === 0) {
        const newDoc = await createDocument(targetProject.id, 'Untitled')
        docs = [newDoc]
      }
      setDocuments(docs)
      
      // Try to find by document number
      const lastDocNumber = getLastDocumentNumberForProject(projectId)
      let targetDoc = docs[0]
      
      if (lastDocNumber) {
        const foundDoc = docs.find(d => d.document_number === lastDocNumber)
        if (foundDoc) {
          targetDoc = foundDoc
        }
      }
      
      // Persist the project selection with the target document
      // Store document number (works for both text and drawing documents)
      if (targetDoc.document_number) {
        setLastVisitedDocumentNumber(targetProject.id, targetDoc.document_number)
      }
      
      return targetDoc.document_number
    } catch (err) {
      console.error('Failed to switch project:', err)
      setLoading(false)
      switchingRef.current = false
      return null
    } finally {
      setLoading(false)
      // Clear flag after a short delay to allow state to settle
      setTimeout(() => {
        switchingRef.current = false
      }, 500)
    }
  }

  return { project, documents, loading, addDocument, refreshDocuments, resetProject, switchProject }
}
