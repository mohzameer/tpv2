import { Alert, Group, Text } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'

export default function ReadOnlyBanner() {
  return (
    <Alert
      icon={<IconLock size={16} />}
      title="Read-only mode"
      color="yellow"
      variant="light"
      styles={{
        root: {
          marginBottom: '1rem'
        }
      }}
    >
      <Text size="sm">
        You are viewing this document in read-only mode. You cannot make edits.
      </Text>
    </Alert>
  )
}

