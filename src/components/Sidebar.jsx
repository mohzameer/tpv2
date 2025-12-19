import { Stack, ActionIcon, Loader, Center, Box, Group, Text, TextInput, Modal, Button, Badge } from '@mantine/core'
import { IconFile, IconPlus, IconChevronLeft, IconTrash, IconLock } from '@tabler/icons-react'
import './Sidebar.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useProjectContext } from '../context/ProjectContext'
import { setLastVisited, getLastDocumentForProject } from '../lib/lastVisited'
import { updateDocument, deleteDocument } from '../lib/api'
import { canCreateDocuments, canDeleteDocument, canViewDocument } from '../lib/permissions'

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
  const { project, documents, loading, addDocument, refreshDocuments, userRole } = useProjectContext()
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  
  // Filter documents based on role and is_open
  const visibleDocuments = documents?.filter(doc => 
    canViewDocument(userRole, doc.is_open !== false)
  ) || []
  
  const totalDocuments = documents?.length || 0
  const hiddenCount = totalDocuments - visibleDocuments.length

  useEffect(() => {
    if (!loading && !docId && visibleDocuments.length > 0 && project) {
      // Check for last visited document for this project
      // Compare as strings to handle type mismatches
      const lastDocId = getLastDocumentForProject(project.id)
      const lastDocIdStr = lastDocId ? String(lastDocId) : null
      const foundDoc = lastDocIdStr ? visibleDocuments.find(d => String(d.id) === lastDocIdStr) : null
      const docToUse = foundDoc ? foundDoc.id : visibleDocuments[0].id
      navigate(`/app/${project.id}/${docToUse}`, { replace: true })
    }
  }, [docId, visibleDocuments, loading, project, navigate])

  // Save last visited whenever docId changes
  useEffect(() => {
    if (project && docId) {
      setLastVisited(project.id, docId)
    }
  }, [project, docId])

  async function handleAddDocument() {
    const doc = await addDocument()
    if (doc && project) {
      navigate(`/app/${project.id}/${doc.id}`)
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
        navigate(`/app/${project.id}/${remaining[0].id}`)
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

  const sortedDocuments = [...visibleDocuments].sort((a, b) => 
    new Date(b.updated_at) - new Date(a.updated_at)
  )

  return (
    <Stack p="sm" gap="xs" style={{ height: '100%' }}>
      {hiddenCount > 0 && (
        <Text size="xs" c="dimmed" ta="center" p="xs">
          Showing {visibleDocuments.length} of {totalDocuments} documents
        </Text>
      )}
      <Stack gap="xs" style={{ flex: 1 }}>
        {sortedDocuments.map((doc) => {
          const isActive = docId !== undefined && String(docId) === String(doc.id)
          const isClosed = doc.is_open === false
          return (
            <Box
              key={doc.id}
              onClick={() => navigate(`/app/${project.id}/${doc.id}`)}
              onDoubleClick={() => handleDoubleClick(doc)}
              p="xs"
              className="sidebar-item"
              data-active={isActive}
            >
              <Group gap="xs" wrap="nowrap">
                {isClosed ? (
                  <IconLock size={16} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
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
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={isActive ? 500 : 400} truncate style={{ flex: 1 }}>
                          {doc.title}
                        </Text>
                        {isClosed && (
                          <Badge size="xs" color="gray" variant="light">
                            Closed
                          </Badge>
                        )}
                      </Group>
                      <Group gap={4} wrap="nowrap" justify="space-between">
                        <Text size="xs" c="dimmed">{formatDate(doc.updated_at)}</Text>
                        {isActive && visibleDocuments.length > 1 && canDeleteDocument(userRole) && (
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
        {canCreateDocuments(userRole) && (
          <ActionIcon 
            variant="subtle" 
            color="gray" 
            size="md" 
            onClick={handleAddDocument}
            title="Create new document"
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
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
