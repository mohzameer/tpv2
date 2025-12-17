import { Group, Burger, SegmentedControl, Text, Box, ActionIcon, Loader } from '@mantine/core'
import { IconSun, IconMoon, IconUser, IconCloud, IconCheck } from '@tabler/icons-react'
import { useTheme } from '../context/ThemeContext'
import { useSync } from '../context/SyncContext'

export default function Header({ sidebarOpen, onToggleSidebar, mode, onModeChange }) {
  const { colorScheme, toggleColorScheme } = useTheme()
  const { isSyncing } = useSync()

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Burger opened={sidebarOpen} onClick={onToggleSidebar} size="sm" />
        <Text fw={600} size="lg">ThinkPost</Text>
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
