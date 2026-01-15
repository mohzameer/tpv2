import { Group, ActionIcon, Loader, Text, TextInput, Menu, Button, Switch } from '@mantine/core'
import { IconSun, IconMoon, IconUser, IconCloud, IconSettings, IconLogout, IconLogin, IconFolder, IconHelp, IconFileImport, IconLink } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'
import { useEditor } from '../context/EditorContext'
import { useShowLinks } from '../context/ShowLinksContext'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoginModal from './LoginModal'
import ProjectsModal from './ProjectsModal'
import HelpModal from './HelpModal'
import MarkdownImportModal from './MarkdownImportModal'

export default function Header() {
  const { colorScheme, toggleColorScheme } = useTheme()
  const { isSyncing } = useSync()
  const { project, refreshDocuments } = useProjectContext()
  const { user, signOut } = useAuth()
  const { editor } = useEditor()
  const [showLinks, setShowLinks] = useShowLinks()
  const navigate = useNavigate()
  const { docId } = useParams()
  const [editing, setEditing] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showProjectsModal, setShowProjectsModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

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

  async function handleMarkdownImport(markdownText, mode) {
    if (!editor || !docId) {
      alert('Editor not available. Please open a document first.')
      return
    }

    try {
      const blocks = await editor.tryParseMarkdownToBlocks(markdownText)
      
      if (!blocks || blocks.length === 0) {
        alert('No content found in markdown file.')
        return
      }
      
      if (mode === 'replace') {
        // Replace all existing content
        editor.replaceBlocks(editor.document, blocks)
      } else {
        // Merge: append to existing content
        const currentBlocks = editor.document
        if (currentBlocks && currentBlocks.length > 0) {
          editor.insertBlocks(blocks, currentBlocks[currentBlocks.length - 1].id, 'after')
        } else {
          // If no existing blocks, just replace
          editor.replaceBlocks(editor.document, blocks)
        }
      }
    } catch (err) {
      console.error('Failed to import markdown:', err)
      alert('Failed to import markdown. Please try again.')
    }
  }

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <img 
          src="/logo.svg" 
          alt="ThinkPost" 
          height={28} 
          onClick={() => setShowProjectsModal(true)}
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
                onClick={() => setShowProjectsModal(true)}
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

      <Group gap="xs">
        {docId && (
          <>
            <Switch
              checked={showLinks}
              onChange={(e) => setShowLinks(e.currentTarget.checked)}
              size="sm"
              label="Show links"
              labelPosition="left"
              styles={{
                label: {
                  fontSize: '12px',
                  color: colorScheme === 'dark' ? '#9ca3af' : '#6b7280',
                  marginRight: '8px',
                },
              }}
            />
            <Button
              variant="subtle"
              onClick={() => setShowImportModal(true)}
              size="xs"
              leftSection={<IconFileImport size={16} />}
              styles={{
                root: {
                  height: '36px',
                  paddingLeft: '12px',
                  paddingRight: '12px',
                  fontWeight: 500,
                  color: colorScheme === 'dark' ? '#9ca3af' : '#6b7280',
                  '&:hover': {
                    backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  },
                },
              }}
            >
              md
            </Button>
          </>
        )}
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
                <Menu.Item leftSection={<IconHelp size={14} />} onClick={() => setShowHelpModal(true)}>
                  Help
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item 
                  color="red" 
                  leftSection={<IconLogout size={14} />} 
                  onClick={async () => {
                    await signOut()
                    navigate('/login')
                  }}
                >
                  Sign out
                </Menu.Item>
              </>
            ) : (
              <>
                <Menu.Item leftSection={<IconLogin size={14} />} onClick={() => setShowLoginModal(true)}>
                  Sign in
                </Menu.Item>
                <Menu.Item leftSection={<IconHelp size={14} />} onClick={() => setShowHelpModal(true)}>
                  Help
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
        <LoginModal opened={showLoginModal} onClose={() => setShowLoginModal(false)} />
        <HelpModal opened={showHelpModal} onClose={() => setShowHelpModal(false)} />
        <MarkdownImportModal 
          opened={showImportModal} 
          onClose={() => setShowImportModal(false)}
          onImport={handleMarkdownImport}
        />
      </Group>
    </Group>
  )
}
