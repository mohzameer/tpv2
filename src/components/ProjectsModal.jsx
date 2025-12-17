import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Stack, Group, Text, ActionIcon, TextInput, Box, Loader, Center } from '@mantine/core'
import { IconFolder, IconPlus, IconCheck, IconX } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { getProjects, createProject } from '../lib/api'
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
    await switchProject(p.id)
    navigate(`/${p.id}`)
    onClose()
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
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddProject()
                  else if (e.key === 'Escape') setAdding(false)
                }}
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
