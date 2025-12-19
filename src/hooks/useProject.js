import { useState, useEffect, useRef } from 'react'
import { getProjects, createProject, getDocuments, createDocument, deleteProject, getUserRole, getProjectMembers } from '../lib/api'
import { getLastVisited, setLastVisited, getLastDocumentForProject } from '../lib/lastVisited'
import { useAuth } from '../context/AuthContext'

export function useProject() {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const { user } = useAuth()

  const prevUserRef = useRef(undefined)
  const isInitializedRef = useRef(false)
  
  // Initialize on mount and when auth state changes
  useEffect(() => {
    const prevUser = prevUserRef.current
    prevUserRef.current = user
    
    // First mount - initialize
    if (!isInitializedRef.current) {
      isInitializedRef.current = true
      initProject()
      return
    }
    
    // Only re-init if user state actually changed (logged in or out)
    // Wait a bit after signout to ensure localStorage is cleared and ready
    if (prevUser !== undefined && prevUser !== user) {
      if (user === null) {
        // User signed out - wait a moment for localStorage to be cleared, then re-init
        setTimeout(() => {
          initProject()
        }, 100)
      } else {
        // User signed in - re-init immediately
        initProject()
      }
    }
  }, [user])

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
    setLoading(true)
    try {
      // Ensure guest_id exists (getGuestId creates it if missing)
      const { getGuestId } = await import('../lib/guest')
      getGuestId()
      
      let projects = await getProjects()
      
      // Create default project if none exists
      if (projects.length === 0) {
        const newProject = await createProject('My Project')
        projects = [newProject]
      }

      // Check for last visited project
      const lastVisited = getLastVisited()
      let currentProject = projects[0]
      
      if (lastVisited?.projectId) {
        const lastProject = projects.find(p => p.id === lastVisited.projectId)
        if (lastProject) {
          currentProject = lastProject
        }
      }

      setProject(currentProject)

      // Load user role and members
      await loadCollaborationData(currentProject.id)

      // Load documents
      let docs = await getDocuments(currentProject.id)
      
      // Create default document if none exists
      if (docs.length === 0) {
        const newDoc = await createDocument(currentProject.id, 'Untitled')
        docs = [newDoc]
      }

      setDocuments(docs)
      
      // Save last visited document for this project
      const lastDocId = getLastDocumentForProject(currentProject.id)
      let docToSave = docs[0]?.id
      
      // Use last visited doc if it exists, otherwise use first doc
      if (lastDocId) {
        const lastDocIdStr = String(lastDocId)
        const foundDoc = docs.find(d => String(d.id) === lastDocIdStr)
        if (foundDoc) {
          docToSave = foundDoc.id
        }
      }
      
      // Save to localStorage
      if (docToSave) {
        setLastVisited(currentProject.id, docToSave)
      }
    } catch (err) {
      console.error('Failed to init project:', err)
      // Don't throw - just log the error so signout can complete
    } finally {
      setLoading(false)
    }
  }

  async function addDocument(title = 'Untitled') {
    if (!project) return
    const doc = await createDocument(project.id, title)
    setDocuments((prev) => [...prev, doc])
    return doc
  }

  async function refreshDocuments() {
    if (!project) return
    const docs = await getDocuments(project.id)
    setDocuments(docs)
  }

  async function switchProject(projectId) {
    setLoading(true)
    try {
      const projects = await getProjects()
      const targetProject = projects.find(p => p.id === projectId)
      if (!targetProject) {
        setLoading(false)
        return null
      }
      
      setProject(targetProject)
      
      // Load user role and members for new project
      await loadCollaborationData(targetProject.id)
      
      let docs = await getDocuments(targetProject.id)
      if (docs.length === 0) {
        const newDoc = await createDocument(targetProject.id, 'Untitled')
        docs = [newDoc]
      }
      setDocuments(docs)
      
      // Get the last visited document for this project
      const lastDocId = getLastDocumentForProject(projectId)
      let targetDocId = docs[0].id
      
      // If we have a last document for this project and it still exists, use it
      // Compare as strings to handle type mismatches
      if (lastDocId) {
        const lastDocIdStr = String(lastDocId)
        const lastDoc = docs.find(d => String(d.id) === lastDocIdStr)
        if (lastDoc) {
          targetDocId = lastDoc.id
        }
      }
      
      // Persist the project selection with the target document
      setLastVisited(targetProject.id, targetDocId)
      
      return targetDocId
    } catch (err) {
      console.error('Failed to switch project:', err)
      setLoading(false)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function loadCollaborationData(projectId) {
    if (!projectId) return
    
    setMembersLoading(true)
    try {
      // Load user role and members in parallel
      const [role, projectMembers] = await Promise.all([
        getUserRole(projectId).catch(() => null), // Return null if not a member
        getProjectMembers(projectId).catch(() => []) // Return empty array on error
      ])
      
      setUserRole(role)
      setMembers(projectMembers || [])
    } catch (err) {
      console.error('Failed to load collaboration data:', err)
      setUserRole(null)
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }

  async function refreshMembers() {
    if (!project) return
    await loadCollaborationData(project.id)
  }

  return { 
    project, 
    documents, 
    loading, 
    addDocument, 
    refreshDocuments, 
    resetProject, 
    switchProject,
    userRole,
    members,
    membersLoading,
    refreshMembers
  }
}
