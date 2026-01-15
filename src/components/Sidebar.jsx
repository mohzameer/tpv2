import { Stack, ActionIcon, Loader, Center, Box, Group, Text, TextInput, Modal, Button, Menu } from '@mantine/core'
import { IconFile, IconPlus, IconTrash, IconBrush } from '@tabler/icons-react'
import './Sidebar.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useProjectContext } from '../context/ProjectContext'
import { getLastDocumentNumberForProject, setLastVisitedDocumentNumber } from '../lib/lastVisited'
import { updateDocument, deleteDocument } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { isDrawing } from '../lib/documentType'

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  
  return date.toLocaleDateString()
}

export default function Sidebar({ onCollapse, onAddDocument }) {
  const navigate = useNavigate()
  const { docId } = useParams()
  const { project, documents, loading, addDocument, refreshDocuments } = useProjectContext()
  const { user } = useAuth()
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!loading && !docId && documents.length > 0 && project) {
      // For guest users: always use first document
      // For logged-in users: check for last visited document for this project
      let docNumberToUse = documents[0].document_number
      
      if (user) {
        // Try to find by document number first (new system)
        const lastDocNumber = getLastDocumentNumberForProject(project.id)
        if (lastDocNumber) {
          const foundDoc = documents.find(d => d.document_number === lastDocNumber)
          if (foundDoc) {
            docNumberToUse = foundDoc.document_number
            navigate(`/${project.id}/${docNumberToUse}`, { replace: true })
            return
          }
        }
      }
      
      navigate(`/${project.id}/${docNumberToUse}`, { replace: true })
    }
  }, [docId, documents, loading, project, navigate, user])

  // Save last visited whenever docId (document_number) changes, but only if:
  // 1. The document_number actually exists in the current project's documents
  // 2. We're not in the middle of a navigation/login flow
  // 3. Add a small delay to prevent saving during rapid navigation
  useEffect(() => {
    if (!project || !docId || loading || savingRef.current) return
    
    // Add a small delay to prevent saving during rapid navigation changes
    const timeoutId = setTimeout(() => {
      // docId in URL is now document_number
      const documentNumber = parseInt(docId, 10)
      if (isNaN(documentNumber)) {
        return
      }
      
      // Verify the document exists in the current project
      const doc = documents.find(d => d.document_number === documentNumber)
      if (!doc) {
        return
      }
      
      // Verify the document matches the project (safety check)
      if (project && documents.length > 0) {
        savingRef.current = true
        
        // Store document number (works for both text and drawing documents)
        setLastVisitedDocumentNumber(project.id, documentNumber)
        savingRef.current = false
      }
    }, 200) // 200ms delay to allow navigation to settle
    
    return () => clearTimeout(timeoutId)
  }, [project, docId, documents, loading])

  // Debug: log documents to console
  useEffect(() => {
    if (!loading && project) {
      console.log('[Sidebar] Documents:', documents.length, documents)
      console.log('[Sidebar] Project:', project?.id)
    }
  }, [documents, loading, project])

  async function handleAddDocument(documentType = 'text') {
    const title = documentType === 'drawing' ? 'Untitled drawing' : 'Untitled'
    const doc = await addDocument(title, documentType)
    if (doc && project && doc.document_number) {
      navigate(`/${project.id}/${doc.document_number}`)
    }
  }

  function handleDoubleClick(doc) {
    setEditingId(doc.id)
    setEditingTitle(doc.title)
  }

  async function handleRename() {
    if (editingId && editingTitle.trim()) {
      await updateDocument(editingId, { title: editingTitle.trim() })
      await refreshDocuments()
    }
    setEditingId(null)
    setEditingTitle('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditingTitle('')
    }
  }

  async function handleDelete() {
    if (!deleteConfirm || documents.length <= 1) return
    
    // docId in URL is now document_number
    const deletingCurrentDoc = docId && parseInt(docId, 10) === deleteConfirm.document_number
    await deleteDocument(deleteConfirm.id)
    await refreshDocuments()
    setDeleteConfirm(null)
    
    if (deletingCurrentDoc && project) {
      // Navigate to first available document
      const remaining = documents.filter(d => d.id !== deleteConfirm.id)
      if (remaining.length > 0) {
        navigate(`/${project.id}/${remaining[0].document_number}`)
      }
    }
  }

  if (loading) {
    return (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    )
  }

  const sortedDocuments = [...documents].sort((a, b) => 
    new Date(b.updated_at) - new Date(a.updated_at)
  )

  // Expose add document handlers if callback provided
  useEffect(() => {
    if (onAddDocument) {
      onAddDocument({
        addText: () => handleAddDocument('text'),
        addDrawing: () => handleAddDocument('drawing'),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddDocument, project])

  return (
    <Stack gap={0} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box className="sidebar-documents-container">
        {sortedDocuments.length === 0 && !loading ? (
          <Center p="md" style={{ height: '100%' }}>
            <Text size="sm" c="dimmed">No documents yet</Text>
          </Center>
        ) : (
          <div className="sidebar-documents-grid">
            {sortedDocuments.map((doc) => {
              // docId in URL is now document_number
              const isActive = docId !== undefined && parseInt(docId, 10) === doc.document_number
              return (
                <Box
                  key={doc.id}
                  onClick={() => navigate(`/${project.id}/${doc.document_number}`)}
                  onDoubleClick={() => handleDoubleClick(doc)}
                  p="xs"
                  className="sidebar-item"
                  data-active={isActive}
                >
                  <Group gap="xs" wrap="nowrap">
                    {isDrawing(doc) ? (
                      <IconBrush size={16} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
                    ) : (
                      <IconFile size={16} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === doc.id ? (
                        <TextInput
                          value={editingTitle}
                          onChange={(e) => {
                            if (e.target.value.length <= 100) {
                              setEditingTitle(e.target.value)
                            }
                          }}
                          onBlur={handleRename}
                          onKeyDown={handleKeyDown}
                          size="xs"
                          maxLength={100}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <Text size="sm" fw={isActive ? 500 : 400} truncate>{doc.title}</Text>
                          <Group gap={4} wrap="nowrap" justify="space-between">
                            <Text size="xs" c="dimmed">{formatDate(doc.updated_at)}</Text>
                            {isActive && documents.length > 1 && (
                              <ActionIcon
                                variant="transparent"
                                size="xs"
                                color="gray"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteConfirm(doc)
                                }}
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            )}
                          </Group>
                        </>
                      )}
                    </div>
                  </Group>
                </Box>
              )
            })}
          </div>
        )}
      </Box>

      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Document" centered size="sm">
        <Text size="sm" mb="lg">Are you sure you want to delete "{deleteConfirm?.title}"?</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="red" onClick={handleDelete}>Delete</Button>
        </Group>
      </Modal>
    </Stack>
  )
}
