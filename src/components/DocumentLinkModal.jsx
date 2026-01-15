import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Stack, Group, Text, ActionIcon, TextInput, Box, Loader, Center } from '@mantine/core'
import { IconFolder, IconFile, IconBrush, IconChevronLeft } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { getProjects, getDocuments } from '../lib/api'
import { isDrawing } from '../lib/documentType'
import './Sidebar.css'

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

export default function DocumentLinkModal({ opened, onClose, onSelectDocument, currentDocumentId }) {
  const { project, switchProject } = useProjectContext()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)

  useEffect(() => {
    if (opened) {
      loadProjects()
      // Automatically select current project
      if (project) {
        setSelectedProject(project)
      } else {
        setSelectedProject(null)
        setDocuments([])
      }
    }
  }, [opened, project])

  useEffect(() => {
    if (selectedProject) {
      loadDocuments(selectedProject.id)
    }
  }, [selectedProject])

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data || [])
    } catch (err) {
      console.error('DocumentLinkModal: Failed to load projects:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadDocuments(projectId) {
    setDocumentsLoading(true)
    try {
      const docs = await getDocuments(projectId)
      setDocuments(docs || [])
    } catch (err) {
      console.error('Failed to load documents:', err)
      setDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }

  function handleSelectProject(p) {
    setSelectedProject(p)
  }

  function handleSelectDocument(doc) {
    if (!selectedProject) return
    
    // Call callback with selected document
    if (onSelectDocument) {
      onSelectDocument(doc)
    }
    onClose()
  }

  // Filter out current document
  const filteredDocuments = currentDocumentId
    ? documents.filter(doc => String(doc.id) !== String(currentDocumentId))
    : documents

  const sortedDocuments = [...filteredDocuments].sort((a, b) => 
    new Date(b.updated_at) - new Date(a.updated_at)
  )

  return (
    <Modal 
      opened={opened} 
      onClose={onClose} 
      title={
        <Group justify="space-between" style={{ width: '100%' }}>
          {selectedProject ? (
            <Group gap="xs">
              <ActionIcon 
                variant="subtle" 
                color="gray" 
                size="sm"
                onClick={() => setSelectedProject(null)}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
              <Text fw={500} size="sm">Select document to link</Text>
            </Group>
          ) : (
            <Text fw={500} size="sm">Select Project</Text>
          )}
        </Group>
      }
      centered
      size="600px"
      styles={{
        body: { 
          padding: 0,
          height: '600px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
        content: {
          display: 'flex',
          flexDirection: 'column',
          height: '600px',
          width: '600px',
          maxWidth: '600px',
          minWidth: '600px',
        },
      }}
    >
      {selectedProject ? (
        // Documents view
        <Box style={{ flex: 1, overflowY: 'auto', padding: '12px', height: 0 }}>
          {documentsLoading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : sortedDocuments.length === 0 ? (
            <Center py="xl">
              <Text size="sm" c="dimmed">No documents available to link</Text>
            </Center>
          ) : (
            <div className="sidebar-documents-grid">
              {sortedDocuments.map((doc) => {
                return (
                  <Box
                    key={doc.id}
                    onClick={() => handleSelectDocument(doc)}
                    p="xs"
                    className="sidebar-item"
                  >
                    <Group gap="xs" wrap="nowrap">
                      {isDrawing(doc) ? (
                        <IconBrush size={16} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
                      ) : (
                        <IconFile size={16} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={400} truncate>{doc.title}</Text>
                        <Text size="xs" c="dimmed">{formatDate(doc.updated_at)}</Text>
                      </div>
                    </Group>
                  </Box>
                )
              })}
            </div>
          )}
        </Box>
      ) : (
        // Projects view
        <Box style={{ flex: 1, overflowY: 'auto', padding: '12px', height: 0, width: '100%' }}>
          {loading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : (
            <Stack gap="xs" style={{ width: '100%' }}>
              {projects.map((p) => (
                <Box
                  key={p.id}
                  onClick={() => handleSelectProject(p)}
                  p="sm"
                  className="sidebar-item"
                  data-active={p.id === project?.id}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                >
                  <Group gap="sm" wrap="nowrap">
                    <IconFolder size={18} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
                    <Text size="sm" fw={p.id === project?.id ? 500 : 400} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</Text>
                  </Group>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Modal>
  )
}
