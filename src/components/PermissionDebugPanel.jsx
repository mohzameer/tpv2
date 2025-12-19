import { useState } from 'react'
import {
  Paper,
  Stack,
  Group,
  Text,
  Button,
  Badge,
  Divider,
  Code,
  Collapse
} from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconBug } from '@tabler/icons-react'
import { useProjectContext } from '../context/ProjectContext'
import { useAuth } from '../context/AuthContext'

export default function PermissionDebugPanel() {
  const { project, userRole, members, documents } = useProjectContext()
  const { user } = useAuth()
  const [opened, setOpened] = useState(false)

  // Only show in development
  if (import.meta.env.PROD) return null

  if (!project) return null

  return (
    <Paper
      p="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 400,
        maxHeight: '80vh',
        overflow: 'auto',
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-white)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBug size={16} />
          <Text size="sm" fw={500}>Permission Debug</Text>
        </Group>
        <Button
          variant="subtle"
          size="xs"
          onClick={() => setOpened(!opened)}
        >
          {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </Button>
      </Group>

      <Collapse in={opened}>
        <Stack gap="md">
          <div>
            <Text size="xs" fw={500} mb="xs">Current User</Text>
            <Code block>{user?.email || user?.id || 'Not authenticated'}</Code>
          </div>

          <div>
            <Text size="xs" fw={500} mb="xs">Your Role</Text>
            <Badge color={userRole === 'owner' ? 'yellow' : userRole === 'editor' ? 'blue' : 'gray'}>
              {userRole || 'Not a member'}
            </Badge>
          </div>

          <Divider />

          <div>
            <Text size="xs" fw={500} mb="xs">Project Members ({members?.length || 0})</Text>
            <Stack gap="xs">
              {members?.map((member) => (
                <Group key={member.id} justify="space-between">
                  <Text size="xs">{member.user?.email || member.user_id}</Text>
                  <Badge size="xs" color={
                    member.role === 'owner' ? 'yellow' :
                    member.role === 'editor' ? 'blue' : 'gray'
                  }>
                    {member.role}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </div>

          <Divider />

          <div>
            <Text size="xs" fw={500} mb="xs">Documents ({documents?.length || 0})</Text>
            <Stack gap="xs">
              {documents?.map((doc) => (
                <div key={doc.id}>
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" fw={500}>{doc.title}</Text>
                    <Badge size="xs" color={doc.is_open ? 'green' : 'red'}>
                      {doc.is_open ? 'Open' : 'Closed'}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Can view: {doc.is_open || ['owner', 'editor'].includes(userRole) ? 'Yes' : 'No'}
                  </Text>
                </div>
              ))}
            </Stack>
          </div>
        </Stack>
      </Collapse>
    </Paper>
  )
}

