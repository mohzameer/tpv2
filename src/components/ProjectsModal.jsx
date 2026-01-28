import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Modal, Stack, Group, Text, ActionIcon, TextInput, Box, Loader, Center, Menu, Button } from '@mantine/core'
import { IconFolder, IconPlus, IconCheck, IconX, IconFile, IconBrush, IconTrash, IconChevronLeft, IconPencil } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { getProjects, createProject, getDocuments, updateDocument, deleteDocument, createDocument } from '../lib/api'
import { getLastDocumentNumberForProject, setLastVisitedDocumentNumber } from '../lib/lastVisited'
import { isDrawing } from '../lib/documentType'
import './Sidebar.css'

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

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
  const isMobile = useIsMobile()

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
    
    // Store document number (works for both text and drawing documents)
    if (doc.document_number) {
      setLastVisitedDocumentNumber(selectedProject.id, doc.document_number)
    }
    
    onClose()
    
    // Navigate to the selected document using document_number
    navigate(`/${selectedProject.id}/${doc.document_number}`)
    
    // If switching to a different project, update the project context
    if (selectedProject.id !== project?.id) {
      await switchProject(selectedProject.id)
    }
  }

  async function handleAddDocument(documentType = 'text') {
    if (!selectedProject) return
    const title = documentType === 'drawing' ? 'Untitled drawing' : 'Untitled'
    try {
      const doc = await createDocument(selectedProject.id, title, documentType)
      
      // If switching to a different project, update the project context
      if (selectedProject.id !== project?.id) {
        await switchProject(selectedProject.id)
      } else {
        // Same project - just refresh documents in context
        await refreshDocuments()
      }
      
      if (doc && doc.document_number) {
        // Store document number when navigating to new document (works for both text and drawing documents)
        setLastVisitedDocumentNumber(selectedProject.id, doc.document_number)
        navigate(`/${selectedProject.id}/${doc.document_number}`)
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
    
    // docId in URL is now document_number
    const deletingCurrentDoc = docId && parseInt(docId, 10) === deleteConfirm.document_number
    await deleteDocument(deleteConfirm.id)
    await loadDocuments(selectedProject.id)
    if (refreshDocuments) {
      await refreshDocuments()
    }
    setDeleteConfirm(null)
    
    if (deletingCurrentDoc && selectedProject) {
      const remaining = documents.filter(d => d.id !== deleteConfirm.id)
      if (remaining.length > 0 && remaining[0].document_number) {
        navigate(`/${selectedProject.id}/${remaining[0].document_number}`)
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
        <Group justify="space-between" style={{ width: '100%' }} wrap="nowrap">
          {selectedProject ? (
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              <ActionIcon 
                variant="subtle" 
                color="gray" 
                size="sm"
                onClick={() => setSelectedProject(null)}
                style={{ flexShrink: 0 }}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
              <Text 
                fw={500} 
                size="sm"
                style={{ 
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {selectedProject.name}
              </Text>
            </Group>
          ) : (
            <Text fw={500} size="sm" style={{ flex: 1 }}>Projects</Text>
          )}
          {selectedProject ? (
            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="outline"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    sx={{
                      '@media (max-width: 768px)': {
                        paddingLeft: '8px',
                        paddingRight: '8px',
                        '& .mantine-Button-inner': {
                          '& > span:not(:first-child)': {
                            display: 'none',
                          },
                        },
                      },
                    }}
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
          ) : (
            <Button
              variant="outline"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setAdding(true)}
              sx={{
                '@media (max-width: 768px)': {
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  '& .mantine-Button-inner': {
                    '& > span:not(:first-child)': {
                      display: 'none',
                    },
                  },
                },
              }}
            >
              New project
            </Button>
          )}
        </Group>
      }
      centered
      size={isMobile ? "100%" : "600px"}
      styles={{
        body: { 
          padding: 0,
          height: isMobile ? '90vh' : '600px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
        content: {
          display: 'flex',
          flexDirection: 'column',
          height: isMobile ? '90vh' : '600px',
          width: isMobile ? '100%' : '600px',
          maxWidth: isMobile ? '100%' : '600px',
          minWidth: isMobile ? '0' : '600px',
          margin: isMobile ? '5vh auto' : undefined,
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
                // docId in URL is now document_number
                const isActive = docId !== undefined && parseInt(docId, 10) === doc.document_number
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
        <Box style={{ flex: 1, overflowY: 'auto', padding: '12px', height: 0, width: '100%' }}>
          {loading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : (
            <Stack gap="xs" style={{ width: '100%' }}>
              {adding && (
                <Group gap="xs" p="sm" style={{ width: '100%', boxSizing: 'border-box' }}>
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
              )}
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
