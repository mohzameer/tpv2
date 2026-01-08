import { Modal, Text, Stack, Anchor } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'

export default function HelpModal({ opened, onClose }) {
  const email = 'zameermfm@gmail.com'

  return (
    <Modal opened={opened} onClose={onClose} title="Help & Support" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          If you have any concerns, questions, or feedback, please feel free to reach out:
        </Text>
        <Stack gap="xs">
          <Text size="sm" fw={500}>Contact Email:</Text>
          <Anchor 
            href={`mailto:${email}`}
            size="md"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <IconMail size={16} />
            {email}
          </Anchor>
        </Stack>
      </Stack>
    </Modal>
  )
}
