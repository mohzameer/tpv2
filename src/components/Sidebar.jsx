import { Stack, ActionIcon, Loader, Center, Box, Group, Text, TextInput } from '@mantine/core'
import { IconFile, IconPlus } from '@tabler/icons-react'
import './Sidebar.css'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useProjectContext } from '../context/ProjectContext'
import { setLastVisited } from '../lib/lastVisited'
import { updateDocument } from '../lib/api'

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

export default function Sidebar() {
  const navigate = useNavigate()
  const { docId } = useParams()
  const { project, documents, loading, addDocument, refreshDocuments } = useProjectContext()
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

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

  if (loading) {
    return (
      <Center p="md">
        <Loader size="sm" />
      </Center>
    )
  }

  return (
    <Stack p="sm" gap="xs" style={{ height: '100%' }}>
      {documents.map((doc) => {
        const isActive = docId !== undefined && String(docId) === String(doc.id)
        console.log('docId:', docId, 'doc.id:', doc.id, 'isActive:', isActive)
        return (
          <Box
            key={doc.id}
            onClick={() => navigate(`/${project.id}/${doc.id}`)}
            onDoubleClick={() => handleDoubleClick(doc)}
            p="xs"
            className="sidebar-item"
            data-active={isActive}
          >
            <Group gap="xs">
              <IconFile size={16} color="var(--mantine-color-gray-6)" />
              <div style={{ flex: 1 }}>
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
                    <Text size="sm" fw={isActive ? 500 : 400}>{doc.title}</Text>
                    <Text size="xs" c="dimmed">{formatDate(doc.updated_at)}</Text>
                  </>
                )}
              </div>
            </Group>
          </Box>
        )
      })}
      <ActionIcon 
        variant="outline" 
        color="gray" 
        size="lg" 
        onClick={handleAddDocument}
        style={{ marginTop: 'auto', alignSelf: 'flex-end' }}
      >
        <IconPlus size={18} />
      </ActionIcon>
    </Stack>
  )
}
