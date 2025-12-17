import { Group, SegmentedControl, Box, ActionIcon, Loader, Text, TextInput } from '@mantine/core'
import { IconSun, IconMoon, IconUser, IconCloud } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useProjectContext } from '../context/ProjectContext'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Header({ sidebarOpen, onToggleSidebar, mode, onModeChange }) {
  const { colorScheme, toggleColorScheme } = useTheme()
  const { isSyncing } = useSync()
  const { project, refreshDocuments } = useProjectContext()
  const [editing, setEditing] = useState(false)
  const [projectName, setProjectName] = useState('')

  function handleDoubleClick() {
    if (project) {
      setProjectName(project.name)
      setEditing(true)
    }
  }

  async function handleSave() {
    if (project && projectName.trim()) {
      await supabase.from('projects').update({ name: projectName.trim() }).eq('id', project.id)
      project.name = projectName.trim()
    }
    setEditing(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') setEditing(false)
  }

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <img 
          src="/logo.png" 
          alt="ThinkPost" 
          height={28} 
          onClick={onToggleSidebar}
          style={{ cursor: 'pointer' }}
        />
        {project && (
          <>
            {editing ? (
              <TextInput
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                size="xs"
                autoFocus
                styles={{ input: { fontWeight: 500 } }}
              />
            ) : (
              <Text 
                size="sm" 
                fw={500} 
                onDoubleClick={handleDoubleClick}
                style={{ cursor: 'pointer' }}
              >
                {project.name}
              </Text>
            )}
          </>
        )}
      </Group>

      <Box style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <SegmentedControl
          value={mode}
          onChange={onModeChange}
          data={[
            { label: 'Notes', value: 'notes' },
            { label: 'Both', value: 'both' },
            { label: 'Drawing', value: 'drawing' },
          ]}
          size="xs"
        />
      </Box>

      <Group gap="xs">
        <ActionIcon variant="transparent" size="lg" style={{ cursor: 'default' }}>
          {isSyncing ? (
            <Loader size={18} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
          ) : (
            <IconCloud size={20} color={colorScheme === 'dark' ? '#22c55e' : '#16a34a'} />
          )}
        </ActionIcon>
        <ActionIcon 
          variant="transparent" 
          onClick={toggleColorScheme} 
          size="lg"
        >
          {colorScheme === 'dark' ? <IconSun size={20} color="#fbbf24" /> : <IconMoon size={20} color="#6b7280" />}
        </ActionIcon>
        <ActionIcon variant="transparent" size="lg">
          <IconUser size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
        </ActionIcon>
      </Group>
    </Group>
  )
}
