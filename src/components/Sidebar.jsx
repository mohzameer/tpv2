import { Stack, ActionIcon, Loader, Center, Box, Group, Text, TextInput, Modal, Button } from '@mantine/core'
import { IconFile, IconPlus, IconChevronLeft, IconTrash } from '@tabler/icons-react'
import './Sidebar.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useProjectContext } from '../context/ProjectContext'
import { setLastVisited } from '../lib/lastVisited'
import { updateDocument, deleteDocument } from '../lib/api'

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
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (!loading && !docId && documents.length > 0 && project) {
      navigate(`/${project.id}/${documents[0].id}`, { replace: true })
    }
  }, [docId, documents, loading, project, navigate])

  // Save last visited whenever docId changes
  useEffect(() => {
    if (project && docId) {
      setLastVisited(project.id, docId)
    }
  }, [project, docId])

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
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={handleRename}
                      onKeyDown={handleKeyDown}
                      size="xs"
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
