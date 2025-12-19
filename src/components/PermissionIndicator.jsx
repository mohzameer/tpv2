import { Group, Text, Stack, Collapse, ActionIcon } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconCheck, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { getPermissionSummary } from '../lib/permissions'

export default function PermissionIndicator({ userRole, compact = false }) {
  const [opened, setOpened] = useState(!compact)
  const permissions = getPermissionSummary(userRole)

  if (!userRole) return null

  const PermissionItem = ({ label, allowed }) => (
    <Group gap="xs" style={{ minHeight: 24 }}>
      {allowed ? (
        <IconCheck size={16} color="green" />
      ) : (
        <IconX size={16} color="gray" />
      )}
      <Text size="sm" c={allowed ? 'green' : 'gray'}>
        {label}
      </Text>
    </Group>
  )

  return (
    <Stack gap="xs">
      {compact && (
        <Group justify="space-between">
          <Text size="sm" fw={500}>Permissions</Text>
          <ActionIcon
            variant="transparent"
            size="sm"
            onClick={() => setOpened(!opened)}
          >
            {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
      )}
      <Collapse in={opened}>
        <Stack gap="xs">
          <PermissionItem label="Can edit text" allowed={permissions.canEditText} />
          <PermissionItem label="Can edit drawing" allowed={permissions.canEditDrawing} />
          <PermissionItem label="Can create documents" allowed={permissions.canCreateDocuments} />
          <PermissionItem label="Can delete documents" allowed={permissions.canDelete} />
          <PermissionItem label="Can manage members" allowed={permissions.canManageMembers} />
        </Stack>
      </Collapse>
    </Stack>
  )
}

