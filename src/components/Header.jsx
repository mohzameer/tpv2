import { Group, ActionIcon, Loader, Text, TextInput, Menu, Button, Switch } from '@mantine/core'
import { IconSun, IconMoon, IconUser, IconCloud, IconSettings, IconLogout, IconLogin, IconFolder, IconHelp, IconFileImport, IconLink } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'
import { useEditor } from '../context/EditorContext'
import { useShowLinks } from '../context/ShowLinksContext'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoginModal from './LoginModal'
import ProjectsModal from './ProjectsModal'
import HelpModal from './HelpModal'
import MarkdownImportModal from './MarkdownImportModal'
import { isText } from '../lib/documentType'

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

export default function Header() {
  const { colorScheme, toggleColorScheme } = useTheme()
  const { isSyncing } = useSync()
  const { project, documents, refreshDocuments } = useProjectContext()
  const { user, signOut } = useAuth()
  const { editor } = useEditor()
  const [showLinks, setShowLinks] = useShowLinks()
  const navigate = useNavigate()
  const { projectId, docId } = useParams()
  const [editing, setEditing] = useState(false)
  const [documentTitle, setDocumentTitle] = useState('')
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showProjectsModal, setShowProjectsModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const isMobile = useIsMobile()

  // Find current document from documents list
  // Only match if the project context matches the URL's projectId
  const isProjectSynced = project && projectId && project.id === projectId
  const currentDocument = docId && documents && isProjectSynced
    ? documents.find(d => d.document_number === parseInt(docId, 10))
    : null
  
  // Track last synced project to avoid redundant refreshes
  const lastSyncedProjectRef = useRef(null)
  
  // Refresh documents when project syncs or document not found
  useEffect(() => {
    if (!docId || !projectId || !isProjectSynced) return
    
    // Refresh once when project changes
    if (lastSyncedProjectRef.current !== projectId) {
      lastSyncedProjectRef.current = projectId
      refreshDocuments()
      return
    }
    
    // Also refresh if document not found (newly created)
    if (!currentDocument && documents.length > 0) {
      refreshDocuments()
    }
  }, [docId, projectId, isProjectSynced, currentDocument, documents.length, refreshDocuments])

  function handleDoubleClick() {
    if (currentDocument) {
      setDocumentTitle(currentDocument.title || 'Untitled')
      setEditing(true)
    }
  }

  async function handleSave() {
    if (currentDocument && documentTitle.trim()) {
      await supabase.from('documents').update({ title: documentTitle.trim() }).eq('id', currentDocument.id)
      currentDocument.title = documentTitle.trim()
      refreshDocuments()
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
    <Group 
      h="100%" 
      px="md" 
      justify="space-between"
      wrap="nowrap"
      style={{
        overflow: 'hidden',
      }}
      sx={{
        '@media (max-width: 768px)': {
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
        },
      }}
    >
      <Group wrap="nowrap" style={{ minWidth: 0, flex: '0 1 auto' }}>
        <img 
          src="/logo.svg" 
          alt="ThinkPost" 
          height={28} 
          onClick={() => setShowProjectsModal(true)}
          style={{ 
            cursor: 'pointer',
            filter: colorScheme === 'dark' ? 'invert(1)' : 'none',
            flexShrink: 0,
          }}
        />
        {project && (
          <>
            <Text 
              size="sm" 
              fw={500}
              onClick={() => setShowProjectsModal(true)}
              style={{ cursor: 'pointer', minWidth: 0, flexShrink: 0 }}
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '150px',
                '@media (max-width: 768px)': {
                  maxWidth: '80px',
                  fontSize: '12px',
                },
              }}
            >
              {project.name}
            </Text>
            {currentDocument && (
              <>
                <Text 
                  size="sm" 
                  c={colorScheme === 'dark' ? '#6b7280' : '#9ca3af'}
                  style={{ flexShrink: 0 }}
                >
                  |
                </Text>
                {editing ? (
                  <TextInput
                    value={documentTitle}
                    onChange={(e) => {
                      if (e.target.value.length <= 100) {
                        setDocumentTitle(e.target.value)
                      }
                    }}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    size="xs"
                    maxLength={100}
                    autoFocus
                    styles={{ input: { fontWeight: 400 } }}
                    sx={{
                      '@media (max-width: 768px)': {
                        width: '100px',
                      },
                    }}
                  />
                ) : (
                  <Text 
                    size="sm" 
                    fw={400}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      handleDoubleClick()
                    }}
                    style={{ cursor: 'pointer', minWidth: 0 }}
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '150px',
                      '@media (max-width: 768px)': {
                        maxWidth: '80px',
                        fontSize: '12px',
                      },
                    }}
                  >
                    {currentDocument.title || 'Untitled'}
                  </Text>
                )}
              </>
            )}
            <ActionIcon 
              variant="transparent" 
              size="sm" 
              onClick={() => setShowProjectsModal(true)}
              sx={{
                flexShrink: 0,
                '@media (max-width: 768px)': {
                  display: 'none',
                },
              }}
            >
              <IconFolder size={18} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
            </ActionIcon>
          </>
        )}
        <ProjectsModal opened={showProjectsModal} onClose={() => setShowProjectsModal(false)} />
      </Group>

      <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        {docId && !isMobile && isText(currentDocument) && (
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
          editor={editor}
        />
      </Group>
    </Group>
  )
}
