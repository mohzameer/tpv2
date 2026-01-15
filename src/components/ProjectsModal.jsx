import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Modal, Stack, Group, Text, ActionIcon, TextInput, Box, Loader, Center, Menu, Button } from '@mantine/core'
import { IconFolder, IconPlus, IconCheck, IconX, IconFile, IconBrush, IconTrash, IconChevronLeft, IconPencil } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { getProjects, createProject, getDocuments, updateDocument, deleteDocument, createDocument } from '../lib/api'
import { getLastDocumentForProject } from '../lib/lastVisited'
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

export default function ProjectsModal({ opened, onClose }) {
  const { project, switchProject, refreshDocuments } = useProjectContext()
  const navigate = useNavigate()
  const { docId } = useParams()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (opened) {
      loadProjects()
      // If there's a current project, show its documents by default
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
      console.error('ProjectsModal: Failed to load projects:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddProject() {
    if (!newName.trim()) return
    try {
      const newProject = await createProject(newName.trim())
      setProjects(prev => [newProject, ...prev])
      setNewName('')
      setAdding(false)
    } catch (err) {
      console.error('Failed to create project:', err)
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

  async function handleSelectDocument(doc) {
    if (!selectedProject) return
    onClose()
    navigate(`/${selectedProject.id}/${doc.id}`)
    if (selectedProject.id !== project?.id) {
      await switchProject(selectedProject.id)
    }
  }

  async function handleAddDocument(documentType = 'text') {
    if (!selectedProject) return
    const title = documentType === 'drawing' ? 'Untitled drawing' : 'Untitled'
    try {
      const doc = await createDocument(selectedProject.id, title, documentType)
      await loadDocuments(selectedProject.id)
      if (doc) {
        navigate(`/${selectedProject.id}/${doc.id}`)
        onClose()
      }
    } catch (err) {
      console.error('Failed to add document:', err)
    }
  }

  function handleDoubleClick(doc) {
    setEditingId(doc.id)
    setEditingTitle(doc.title)
  }

  async function handleRename() {
    if (editingId && editingTitle.trim()) {
      await updateDocument(editingId, { title: editingTitle.trim() })
      await loadDocuments(selectedProject.id)
      if (refreshDocuments) {
        await refreshDocuments()
      }
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
    if (!deleteConfirm || !selectedProject || documents.length <= 1) return
    
    const deletingCurrentDoc = String(docId) === String(deleteConfirm.id)
    await deleteDocument(deleteConfirm.id)
    await loadDocuments(selectedProject.id)
    if (refreshDocuments) {
      await refreshDocuments()
    }
    setDeleteConfirm(null)
    
    if (deletingCurrentDoc && selectedProject) {
      const remaining = documents.filter(d => d.id !== deleteConfirm.id)
      if (remaining.length > 0) {
        navigate(`/${selectedProject.id}/${remaining[0].id}`)
        onClose()
      }
    }
  }

  const sortedDocuments = [...documents].sort((a, b) => 
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
              <Text fw={500} size="sm">{selectedProject.name}</Text>
            </Group>
          ) : (
            <Text fw={500} size="sm">Projects</Text>
          )}
          {selectedProject && (
            <Group gap="xs">
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="outline"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                  >
                    New document
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item 
                    leftSection={<IconFile size={14} />}
                    onClick={() => handleAddDocument('text')}
                  >
                    New document
                  </Menu.Item>
                  <Menu.Item 
                    leftSection={<IconBrush size={14} />}
                    onClick={() => handleAddDocument('drawing')}
                  >
                    New drawing
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )}
        </Group>
      }
      centered
      size={selectedProject ? "500px" : "400px"}
      styles={{
        body: { 
          padding: 0,
          maxHeight: '70vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
        content: {
          display: 'flex',
          flexDirection: 'column',
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
              <Text size="sm" c="dimmed">No documents yet</Text>
            </Center>
          ) : (
            <div className="sidebar-documents-grid">
              {sortedDocuments.map((doc) => {
                const isActive = docId !== undefined && String(docId) === String(doc.id)
                return (
                  <Box
                    key={doc.id}
                    onClick={() => handleSelectDocument(doc)}
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
                              <Group gap={4} wrap="nowrap">
                                <ActionIcon
                                  variant="transparent"
                                  size="xs"
                                  color="gray"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDoubleClick(doc)
                                  }}
                                >
                                  <IconPencil size={12} />
                                </ActionIcon>
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
      ) : (
        // Projects view
        <Box style={{ flex: 1, overflowY: 'auto', padding: '12px', height: 0 }}>
          {loading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : (
            <Stack gap="xs">
              {projects.map((p) => (
                <Box
                  key={p.id}
                  onClick={() => handleSelectProject(p)}
                  p="sm"
                  className="sidebar-item"
                  data-active={p.id === project?.id}
                >
                  <Group gap="sm">
                    <IconFolder size={18} color="var(--mantine-color-gray-6)" />
                    <Text size="sm" fw={p.id === project?.id ? 500 : 400}>{p.name}</Text>
                  </Group>
                </Box>
              ))}
              
              {adding ? (
                <Group gap="xs">
                  <IconFolder size={18} color="var(--mantine-color-gray-6)" />
                  <TextInput
                    placeholder="Project name"
                    size="xs"
                    value={newName}
                    onChange={(e) => {
                      if (e.target.value.length <= 100) {
                        setNewName(e.target.value)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddProject()
                      else if (e.key === 'Escape') setAdding(false)
                    }}
                    maxLength={100}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <ActionIcon size="sm" color="green" variant="subtle" onClick={handleAddProject}>
                    <IconCheck size={14} />
                  </ActionIcon>
                  <ActionIcon size="sm" color="gray" variant="subtle" onClick={() => setAdding(false)}>
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              ) : (
                <Box
                  onClick={() => setAdding(true)}
                  p="sm"
                  className="sidebar-item"
                >
                  <Group gap="sm">
                    <IconPlus size={18} color="var(--mantine-color-gray-6)" />
                    <Text size="sm" c="dimmed">New project</Text>
                  </Group>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      )}

      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Document" centered size="sm">
        <Text size="sm" mb="lg">Are you sure you want to delete "{deleteConfirm?.title}"?</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="red" onClick={handleDelete}>Delete</Button>
        </Group>
      </Modal>
    </Modal>
  )
}
