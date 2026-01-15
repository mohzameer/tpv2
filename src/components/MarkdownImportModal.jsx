import { Modal, Button, FileButton, Radio, Group, Stack, Text, Tabs, Textarea } from '@mantine/core'
import { IconFileUpload, IconClipboard } from '@tabler/icons-react'
import { useState } from 'react'

export default function MarkdownImportModal({ opened, onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [pastedText, setPastedText] = useState('')
  const [activeTab, setActiveTab] = useState('file')
  const [importMode, setImportMode] = useState('replace')

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && (selectedFile.type === 'text/markdown' || selectedFile.name.endsWith('.md') || selectedFile.name.endsWith('.markdown'))) {
      setFile(selectedFile)
    } else {
      alert('Please select a valid markdown file (.md or .markdown)')
    }
  }

  const handleImport = async () => {
    let markdownText = ''

    if (activeTab === 'file') {
      if (!file) {
        alert('Please select a markdown file')
        return
      }

      try {
        markdownText = await file.text()
      } catch (err) {
        console.error('Failed to read file:', err)
        alert('Failed to read file. Please try again.')
        return
      }
    } else {
      // Paste mode
      markdownText = pastedText.trim()
      if (!markdownText) {
        alert('Please paste some markdown content')
        return
      }
    }

    if (!markdownText) {
      alert('No markdown content to import')
      return
    }

    onImport(markdownText, importMode)
    setFile(null)
    setPastedText('')
    setImportMode('replace')
    setActiveTab('file')
    onClose()
  }

  const canImport = activeTab === 'file' ? file !== null : pastedText.trim().length > 0

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Import Markdown"
      size="lg"
    >
      <Stack gap="md">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="file" leftSection={<IconFileUpload size={16} />}>
              From File
            </Tabs.Tab>
            <Tabs.Tab value="paste" leftSection={<IconClipboard size={16} />}>
              Paste
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="file" pt="md">
            <FileButton onChange={handleFileSelect} accept=".md,.markdown,text/markdown">
              {(props) => (
                <Button
                  {...props}
                  leftSection={<IconFileUpload size={16} />}
                  variant="light"
                  fullWidth
                >
                  {file ? file.name : 'Select Markdown File'}
                </Button>
              )}
            </FileButton>
          </Tabs.Panel>

          <Tabs.Panel value="paste" pt="md">
            <Textarea
              placeholder="Paste your markdown content here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              minRows={10}
              maxRows={20}
              autosize
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
            />
            <Text size="xs" c="dimmed" mt="xs">
              Large markdown content is supported
            </Text>
          </Tabs.Panel>
        </Tabs>

        <div>
          <Text size="sm" fw={500} mb="xs">
            Import Mode
          </Text>
          <Radio.Group value={importMode} onChange={setImportMode}>
            <Stack gap="xs">
              <Radio
                value="replace"
                label="Replace existing content"
                description="Clear all current content and replace with imported markdown"
              />
              <Radio
                value="merge"
                label="Merge with existing content"
                description="Append imported markdown to the end of current content"
              />
            </Stack>
          </Radio.Group>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            Import
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
