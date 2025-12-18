import { useState, useEffect } from 'react'
import { getProjects, createProject, getDocuments, createDocument, deleteProject } from '../lib/api'
import { getLastVisited, setLastVisited, getLastDocumentForProject } from '../lib/lastVisited'

export function useProject() {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initProject()
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
    setLoading(true)
    try {
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

      // Load documents
      let docs = await getDocuments(currentProject.id)
      
      // Create default document if none exists
      if (docs.length === 0) {
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

  return { project, documents, loading, addDocument, refreshDocuments, resetProject, switchProject }
}
