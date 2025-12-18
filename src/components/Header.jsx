import { Group, SegmentedControl, Box, ActionIcon, Loader, Text, TextInput, Menu } from '@mantine/core'
import { IconSun, IconMoon, IconUser, IconCloud, IconSettings, IconLogout, IconLogin, IconFolder } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoginModal from './LoginModal'
import ProjectsModal from './ProjectsModal'

export default function Header({ sidebarOpen, onToggleSidebar, mode, onModeChange }) {
  const { colorScheme, toggleColorScheme } = useTheme()
  const { isSyncing } = useSync()
  const { project, refreshDocuments } = useProjectContext()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showProjectsModal, setShowProjectsModal] = useState(false)

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
          src="/logo.svg" 
          alt="ThinkPost" 
          height={28} 
          onClick={onToggleSidebar}
          style={{ 
            cursor: 'pointer',
            filter: colorScheme === 'dark' ? 'invert(1)' : 'none'
          }}
        />
        {project && (
          <>
            {editing ? (
              <TextInput
                value={projectName}
                onChange={(e) => {
                  if (e.target.value.length <= 100) {
                    setProjectName(e.target.value)
                  }
                }}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                size="xs"
                maxLength={100}
                autoFocus
                styles={{ input: { fontWeight: 500 } }}
              />
            ) : (
              <Text 
                size="sm" 
                fw={500} 
                onClick={onToggleSidebar}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  handleDoubleClick()
                }}
                style={{ cursor: 'pointer' }}
              >
                {project.name}
              </Text>
            )}
            <ActionIcon variant="transparent" size="sm" onClick={() => setShowProjectsModal(true)}>
              <IconFolder size={18} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
            </ActionIcon>
          </>
        )}
        <ProjectsModal opened={showProjectsModal} onClose={() => setShowProjectsModal(false)} />
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
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <ActionIcon variant="transparent" size="lg">
              <IconUser size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {user ? (
              <>
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate('/settings')}>
                  Settings
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item 
                  color="red" 
                  leftSection={<IconLogout size={14} />} 
                  onClick={async () => {
                    await signOut()
                  }}
                >
                  Sign out
                </Menu.Item>
              </>
            ) : (
              <Menu.Item leftSection={<IconLogin size={14} />} onClick={() => setShowLoginModal(true)}>
                Sign in
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
        <LoginModal opened={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </Group>
    </Group>
  )
}
