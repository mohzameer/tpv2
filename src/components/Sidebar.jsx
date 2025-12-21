import { Stack, ActionIcon, Loader, Center, Box, Group, Text, TextInput, Modal, Button } from '@mantine/core'
import { IconFile, IconPlus, IconChevronLeft, IconTrash } from '@tabler/icons-react'
import './Sidebar.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useProjectContext } from '../context/ProjectContext'
import { setLastVisited, getLastDocumentForProject } from '../lib/lastVisited'
import { updateDocument, deleteDocument } from '../lib/api'
import { useAuth } from '../context/AuthContext'

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

export default function Sidebar({ onCollapse }) {
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
      let docToUse = documents[0].id
      
      if (user) {
        // Only check last visited for logged-in users
        const lastDocId = getLastDocumentForProject(project.id)
        const lastDocIdStr = lastDocId ? String(lastDocId) : null
        const foundDoc = lastDocIdStr ? documents.find(d => String(d.id) === lastDocIdStr) : null
        if (foundDoc) {
          docToUse = foundDoc.id
        }
      }
      
      navigate(`/${project.id}/${docToUse}`, { replace: true })
    }
  }, [docId, documents, loading, project, navigate, user])

  // Save last visited whenever docId changes, but only if:
  // 1. The docId actually exists in the current project's documents
  // 2. We're not in the middle of a navigation/login flow
  // 3. Add a small delay to prevent saving during rapid navigation
  useEffect(() => {
    if (!project || !docId || loading || savingRef.current) return
    
    // Add a small delay to prevent saving during rapid navigation changes
    const timeoutId = setTimeout(() => {
      // Verify the document exists in the current project
      const docExists = documents.some(d => String(d.id) === String(docId))
      if (!docExists) {
        console.log('Sidebar: Not saving - docId', docId, 'not found in current project documents. Available docs:', documents.map(d => d.id))
        return
      }
      
      // Verify the docId matches the project (safety check)
      if (project && documents.length > 0) {
        console.log('Sidebar: Saving last visited - project:', project.id, 'docId:', docId, 'docExists:', docExists, 'documents:', documents.map(d => ({ id: d.id, title: d.title })))
        savingRef.current = true
        setLastVisited(project.id, docId)
          .then(() => {
            savingRef.current = false
            console.log('Sidebar: Successfully saved last visited')
          })
          .catch(err => {
            console.error('Sidebar: Failed to save last visited:', err)
            savingRef.current = false
          })
      }
    }, 200) // 200ms delay to allow navigation to settle
    
    return () => clearTimeout(timeoutId)
  }, [project, docId, documents, loading])

  async function handleAddDocument() {
    const doc = await addDocument()
    if (doc && project) {
      navigate(`/${project.id}/${doc.id}`)
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
    
    const deletingCurrentDoc = String(docId) === String(deleteConfirm.id)
    await deleteDocument(deleteConfirm.id)
    await refreshDocuments()
    setDeleteConfirm(null)
    
    if (deletingCurrentDoc && project) {
      // Navigate to first available document
      const remaining = documents.filter(d => d.id !== deleteConfirm.id)
      if (remaining.length > 0) {
        navigate(`/${project.id}/${remaining[0].id}`)
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

  return (
    <Stack p="sm" gap="xs" style={{ height: '100%' }}>
      <Stack gap="xs" style={{ flex: 1 }}>
        {sortedDocuments.map((doc) => {
          const isActive = docId !== undefined && String(docId) === String(doc.id)
          return (
            <Box
              key={doc.id}
              onClick={() => navigate(`/${project.id}/${doc.id}`)}
              onDoubleClick={() => handleDoubleClick(doc)}
              p="xs"
              className="sidebar-item"
              data-active={isActive}
            >
              <Group gap="xs" wrap="nowrap">
                <IconFile size={16} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
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
      </Stack>
      <Group justify="space-between">
        <ActionIcon 
          variant="subtle" 
          color="gray" 
          size="md" 
          onClick={onCollapse}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
        <ActionIcon 
          variant="subtle" 
          color="gray" 
          size="md" 
          onClick={handleAddDocument}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Group>

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
