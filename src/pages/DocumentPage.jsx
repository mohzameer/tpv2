import { useParams } from 'react-router-dom'
import NotesPanel from '../components/NotesPanel'
import DrawingPanel from '../components/DrawingPanel'
import { useState, useEffect, useRef } from 'react'
import { getDocumentByNumber } from '../lib/api'
import { getDocumentType } from '../lib/documentType'
import { useAuth } from '../context/AuthContext'
import { useProjectContext } from '../context/ProjectContext'
import { Loader, Center, Text } from '@mantine/core'

export default function DocumentPage() {
  const { projectId, docId } = useParams()
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()
  const { project, switchProject, loading: projectLoading } = useProjectContext()
  const navigatingRef = useRef(false)
  const lastProjectIdRef = useRef(projectId)

  // Track when projectId changes (navigation happening)
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      navigatingRef.current = true
      lastProjectIdRef.current = projectId
      // Clear the navigating flag after navigation completes
      setTimeout(() => {
        navigatingRef.current = false
      }, 300)
    }
  }, [projectId])

  // Sync project with URL projectId - ensure the project in context matches the URL
  // Add a small delay to prevent race conditions when switching projects
  useEffect(() => {
    if (!projectId || projectLoading) {
      return
    }
    
    // Don't sync if we're in the middle of navigation - wait for it to complete
    if (navigatingRef.current) {
      return
    }
    
    // If project is already correct, no need to switch
    if (project && project.id === projectId) {
      return
    }
    
    // Add a small delay to allow switchProject to complete if it was just called
    const timer = setTimeout(() => {
      // Check again if we're still navigating
      if (navigatingRef.current) {
        return
      }
      
      if (project && project.id !== projectId && !projectLoading) {
        switchProject(projectId)
      }
    }, 200)
    
    return () => clearTimeout(timer)
  }, [projectId, project, switchProject, projectLoading])

  // Load document when docId (document_number) changes
  useEffect(() => {
    if (!docId || !projectId) {
      return
    }
    
    // Wait for auth to be ready before loading (prevents loading wrong doc during login)
    if (authLoading) {
      return
    }
    
    // Small delay to allow navigation to complete after login
    // This prevents loading the wrong document if user just logged in
    const timer = setTimeout(() => {
      loadDocument()
    }, 150)
    
    return () => {
      clearTimeout(timer)
    }
  }, [docId, projectId, user, authLoading])

  async function loadDocument() {
    setLoading(true)
    try {
      // docId in URL is now document_number
      const documentNumber = parseInt(docId, 10)
      if (isNaN(documentNumber)) {
        console.error('[DocumentPage] Invalid document number:', docId)
        setDocument(null)
        return
      }
      const doc = await getDocumentByNumber(projectId, documentNumber)
      setDocument(doc)
    } catch (err) {
      console.error('[DocumentPage] Failed to load document:', err)
      setDocument(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Loader size="md" />
      </Center>
    )
  }

  if (!document) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Text c="dimmed">Document not found</Text>
      </Center>
    )
  }

  const documentType = getDocumentType(document)

  return (
    <div style={{ height: '100%', width: '100%' }}>
      {documentType === 'drawing' ? (
        <DrawingPanel docId={document.id} />
      ) : (
        <NotesPanel docId={document.id} />
      )}
    </div>
  )
}
