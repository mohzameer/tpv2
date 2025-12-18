import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Stack, Group, Text, ActionIcon, TextInput, Box, Loader, Center } from '@mantine/core'
import { IconFolder, IconPlus, IconCheck, IconX } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { getProjects, createProject } from '../lib/api'
import { getLastDocumentForProject } from '../lib/lastVisited'
import { getDocuments } from '../lib/api'
import './Sidebar.css'

export default function ProjectsModal({ opened, onClose }) {
  const { project, switchProject } = useProjectContext()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (opened) {
      loadProjects()
    }
  }, [opened])

  async function loadProjects() {
    setLoading(true)
    try {
      const data = await getProjects()
      setProjects(data)
    } catch (err) {
      console.error('Failed to load projects:', err)
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

  async function handleSelect(p) {
    if (p.id === project?.id) {
      onClose()
      return
    }
    
    // Close modal first
    onClose()
    
    // Get the last visited document for this project BEFORE switching
    const lastDocId = getLastDocumentForProject(p.id)
    console.log('Last doc ID for project', p.id, ':', lastDocId)
    
    // Switch project
    await switchProject(p.id)
    
    // Get documents after switching (they should be loaded by switchProject)
    // But we'll get them again to be sure we have the latest
    let docToNavigate = null
    try {
      const docs = await getDocuments(p.id)
      console.log('Documents for project', p.id, ':', docs.map(d => ({ id: d.id, title: d.title })))
      
      if (docs.length > 0) {
        // Use last visited document if it exists in the documents list
        // Compare as strings to handle type mismatches
        const lastDocIdStr = String(lastDocId)
        const foundDoc = docs.find(d => String(d.id) === lastDocIdStr)
        if (lastDocId && foundDoc) {
          docToNavigate = foundDoc.id
          console.log('Using last visited document:', docToNavigate)
        } else {
          docToNavigate = docs[0].id
          console.log('Using first document:', docToNavigate, '(lastDocId was:', lastDocId, ')')
        }
      }
    } catch (err) {
      console.error('Failed to get documents:', err)
    }
    
    // Navigate to the document
    if (docToNavigate) {
      console.log('Navigating to:', `/${p.id}/${docToNavigate}`)
      navigate(`/${p.id}/${docToNavigate}`)
    } else {
      navigate(`/${p.id}`)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Projects" centered>
      {loading ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <Stack gap="xs">
          {projects.map((p) => (
            <Box
              key={p.id}
              onClick={() => handleSelect(p)}
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
    </Modal>
  )
}
