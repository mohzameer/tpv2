import { useState, useEffect } from 'react'
import { getProjects, createProject, getDocuments, createDocument, deleteProject } from '../lib/api'
import { getLastVisited, setLastVisited, getLastDocumentForProject } from '../lib/lastVisited'
import { useAuth } from '../context/AuthContext'

export function useProject() {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { loading: authLoading, user } = useAuth()

  useEffect(() => {
    // Wait for auth to finish loading before initializing projects
    if (authLoading) {
      console.log('[useProject] Waiting for auth to finish loading...')
      return
    }
    
    console.log('[useProject] Auth loaded, user:', user?.id || 'none', '- initializing projects...')
    initProject()
  }, [authLoading, user])

  async function resetProject() {
    setLoading(true)
    setError(null)
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
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  async function initProject() {
    console.log('[useProject] initProject - Starting initialization... user:', user?.id || 'none')
    setLoading(true)
    setError(null)
    try {
      console.log('[useProject] initProject - Fetching projects with userId:', user?.id || null)
      let projects = await getProjects(user?.id || null)
      console.log('[useProject] initProject - Got projects:', projects.length, projects)
      
      // Create default project if none exists
      if (projects.length === 0) {
        console.log('[useProject] initProject - No projects found, creating default project...')
        const newProject = await createProject('My Project')
        projects = [newProject]
        console.log('[useProject] initProject - Created default project:', newProject)
      }

      // Check for last visited project
      const lastVisited = getLastVisited()
      console.log('[useProject] initProject - Last visited:', lastVisited)
      let currentProject = projects[0]
      
      if (lastVisited?.projectId) {
        const lastProject = projects.find(p => p.id === lastVisited.projectId)
        if (lastProject) {
          currentProject = lastProject
          console.log('[useProject] initProject - Using last visited project:', currentProject.id)
        } else {
          console.log('[useProject] initProject - Last visited project not found, using first project')
        }
      }

      console.log('[useProject] initProject - Setting current project:', currentProject.id)
      setProject(currentProject)

      // Load documents
      console.log('[useProject] initProject - Loading documents for project:', currentProject.id, 'with userId:', user?.id || null)
      let docs = await getDocuments(currentProject.id, user?.id || null)
      console.log('[useProject] initProject - Got documents:', docs.length, docs)
      
      // Create default document if none exists
      if (docs.length === 0) {
        console.log('[useProject] initProject - No documents found, creating default document...')
        const newDoc = await createDocument(currentProject.id, 'Untitled')
        docs = [newDoc]
        console.log('[useProject] initProject - Created default document:', newDoc)
      }

      setDocuments(docs)
      console.log('[useProject] initProject - Initialization complete. Project:', currentProject.id, 'Documents:', docs.length)
    } catch (err) {
      console.error('[useProject] initProject - Failed to init project:', err)
      console.error('[useProject] initProject - Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      setError(err)
    } finally {
      setLoading(false)
      console.log('[useProject] initProject - Loading set to false')
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

  return { project, documents, loading, error, addDocument, refreshDocuments, resetProject, switchProject }
}
