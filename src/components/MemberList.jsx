import { Stack, Group, Text, Avatar, Select, ActionIcon, Menu } from '@mantine/core'
import { IconDots, IconTrash, IconEdit } from '@tabler/icons-react'
import RoleBadge from './RoleBadge'
import { useAuth } from '../context/AuthContext'

export default function MemberList({ 
  members, 
  currentUserId, 
  onRemoveMember,
  onChangeRole,
  canManage = false 
}) {
  const { user } = useAuth()
  const currentUser = currentUserId || user?.id

  if (!members || members.length === 0) {
    return (
      <Text size="sm" c="dimmed">No members yet</Text>
    )
  }

  return (
    <Stack gap="xs">
      {members.map((member) => {
        const isCurrentUser = member.user_id === currentUser
        const userEmail = member.email || member.user_id || 'Unknown user'
        const hasDisplayName = member.display_name && member.display_name.trim() !== ''
        
        // If display_name exists, show "Display Name (email)", otherwise show only email
        const displayText = hasDisplayName 
          ? `${member.display_name} (${userEmail})`
          : userEmail
        
        // For avatar, use first letter of display_name or email
        const avatarInitial = (hasDisplayName ? member.display_name : userEmail).charAt(0).toUpperCase()
        const isOwner = member.role === 'owner'
        
        return (
          <Group key={member.id} justify="space-between" p="xs" style={{
            backgroundColor: isCurrentUser ? 'var(--mantine-color-blue-light)' : 'transparent',
            borderRadius: 'var(--mantine-radius-sm)'
          }}>
            <Group gap="sm" style={{ flex: 1 }}>
              <Avatar size="sm" color="blue">
                {avatarInitial}
              </Avatar>
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={isCurrentUser ? 500 : 400}>
                  {displayText}
                  {isCurrentUser && (
                    <Text component="span" size="xs" c="dimmed" ml="xs">(You)</Text>
                  )}
                </Text>
              </div>
            </Group>
            <Group gap="xs">
              {canManage && !isCurrentUser && !isOwner ? (
                <>
                  <Select
                    value={member.role}
                    onChange={(value) => onChangeRole && onChangeRole(member.user_id, value)}
                    data={[
                      { value: 'editor', label: 'Editor' },
                      { value: 'viewer', label: 'Viewer' }
                    ]}
                    size="xs"
                    style={{ width: 100 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => onRemoveMember && onRemoveMember(member.user_id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </>
              ) : (
                <RoleBadge role={member.role} size="sm" />
              )}
            </Group>
          </Group>
        )
      })}
    </Stack>
  )
}

