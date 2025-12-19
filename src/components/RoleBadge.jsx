import { Badge, Tooltip } from '@mantine/core'
import { IconCrown, IconPencil, IconEye } from '@tabler/icons-react'

export default function RoleBadge({ role, size = 'sm' }) {
  const roleConfig = {
    owner: {
      label: 'Owner',
      color: 'yellow',
      icon: IconCrown,
      tooltip: 'Full control: edit, delete, manage sharing'
    },
    editor: {
      label: 'Editor',
      color: 'blue',
      icon: IconPencil,
      tooltip: 'Can edit text, create documents, but cannot delete or manage members'
    },
    viewer: {
      label: 'Viewer',
      color: 'gray',
      icon: IconEye,
      tooltip: 'Read-only access: can view but cannot edit'
    }
  }

  const config = roleConfig[role]
  if (!config) return null

  const Icon = config.icon

  return (
    <Tooltip label={config.tooltip} withArrow>
      <Badge
        color={config.color}
        variant="light"
        size={size}
        leftSection={<Icon size={14} />}
      >
        {config.label}
      </Badge>
    </Tooltip>
  )
}

