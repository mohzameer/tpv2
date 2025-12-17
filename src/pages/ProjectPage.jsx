import { Center, Text } from '@mantine/core'
import { useParams } from 'react-router-dom'

export default function ProjectPage() {
  const { projectId } = useParams()

  return (
    <Center h="100%">
      <Text c="dimmed">Project: {projectId} – Select a document</Text>
    </Center>
  )
}
