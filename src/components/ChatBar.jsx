import { Stack, ScrollArea, Text, TextInput, ActionIcon, Paper, Group, Avatar, Loader, Menu, Modal, Button, Center } from '@mantine/core'
import { IconSend, IconRobot, IconUser, IconTrash, IconDots } from '@tabler/icons-react'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getDocumentContent, updateDocumentContent } from '../lib/api'
import { extractNotesSummary } from '../lib/notesExtractor'
import { extractDrawingSummary } from '../lib/excalidraw/excalidrawParser'
import { processTextInsertion } from '../lib/ai/textActionHandler'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './ChatBar.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const AI_ENDPOINT = `${supabaseUrl}/functions/v1/ai-messages`

const initialMessages = [
  {
    id: 1,
    role: 'assistant',
    content: "Hello! I'm your AI assistant. Ask me about your notes or drawing.",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
]


export default function ChatBar() {
  const { docId } = useParams()
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [clearChatOpened, setClearChatOpened] = useState(false)
  const scrollAreaRef = useRef(null)
  const viewportRef = useRef(null)

  // Load chat messages when docId changes
  useEffect(() => {
    if (!docId) {
      setMessages(initialMessages)
      return
    }
    loadChatMessages()
  }, [docId])

  async function loadChatMessages() {
    if (!docId) return
    
    setLoadingChat(true)
    try {
      const content = await getDocumentContent(docId)
      if (content?.chat_messages && Array.isArray(content.chat_messages) && content.chat_messages.length > 0) {
        setMessages(content.chat_messages)
      } else {
        setMessages(initialMessages)
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err)
      setMessages(initialMessages)
    } finally {
      setLoadingChat(false)
    }
  }

  async function saveChatMessages(messagesToSave) {
    if (!docId) return
    
    try {
      await updateDocumentContent(docId, { chat_messages: messagesToSave })
    } catch (err) {
      console.error('Failed to save chat messages:', err)
    }
  }

  async function handleClearChat() {
    if (!docId) return
    
    // Keep only the first welcome message
    const clearedMessages = initialMessages
    setMessages(clearedMessages)
    await saveChatMessages(clearedMessages)
  }

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, sending])

  async function handleSend() {
    if (!input.trim() || sending) return

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    await saveChatMessages(nextMessages)
    setInput('')
    setSending(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      // Fetch document content for context
      let notesSummary = ''
      let drawingSummary = ''
      let systemPrompt = ''

      if (docId) {
        try {
          const content = await getDocumentContent(docId)
          
          if (content?.notes_content) {
            notesSummary = await extractNotesSummary(content.notes_content)
          }
          
          if (content?.drawing_content) {
            drawingSummary = extractDrawingSummary(content.drawing_content)
          }

          // Build system prompt with context
          if (notesSummary || drawingSummary) {
            systemPrompt = 'You are an AI assistant helping with a document.\n\n'
            if (notesSummary && notesSummary !== 'No notes content available') {
              systemPrompt += `NOTES CONTENT:\n${notesSummary}\n\n`
            }
            if (drawingSummary && drawingSummary !== 'No drawing content available') {
              systemPrompt += `DRAWING CONTENT:\n${drawingSummary}\n\n`
            }
            systemPrompt += 'Use the above context to answer questions about the document. You can reference specific elements, their positions, labels, and relationships when answering.\n\n'
            systemPrompt += 'TEXT INSERTION: When the user asks to add text, notes, or content to the text editor, return JSON with this format:\n'
            systemPrompt += '```json\n{\n  "action": "insert_text",\n  "text": "The text content to add",\n  "blockType": "paragraph"\n}\n```\n'
            systemPrompt += 'Supported blockType: "paragraph", "heading" (use "level": 1-3 for headings).\n\n'
            systemPrompt += 'DRAWING MODIFICATIONS: If the user asks to add, create, modify, or draw elements in the drawing/canvas, politely respond that this feature is not yet available. Say: "I apologize, but I cannot create or modify drawings yet. I can only help you understand existing drawings and add text to your notes."'
          } else {
            systemPrompt = 'You are an AI assistant.\n\n'
            systemPrompt += 'TEXT INSERTION: When the user asks to add text, notes, or content to the text editor, return JSON with this format:\n'
            systemPrompt += '```json\n{\n  "action": "insert_text",\n  "text": "The text content to add",\n  "blockType": "paragraph"\n}\n```\n'
            systemPrompt += 'Supported blockType: "paragraph", "heading" (use "level": 1-3 for headings).\n\n'
            systemPrompt += 'DRAWING MODIFICATIONS: If the user asks to add, create, modify, or draw elements in the drawing/canvas, politely respond that this feature is not yet available. Say: "I apologize, but I cannot create or modify drawings yet. I can only help you understand existing drawings and add text to your notes."'
          }
        } catch (err) {
          console.error('Failed to load document context:', err)
          systemPrompt = 'You are an AI assistant.\n\n'
          systemPrompt += 'TEXT INSERTION: When the user asks to add text, notes, or content to the text editor, return JSON with this format:\n'
          systemPrompt += '```json\n{\n  "action": "insert_text",\n  "text": "The text content to add",\n  "blockType": "paragraph"\n}\n```\n'
          systemPrompt += 'Supported blockType: "paragraph", "heading" (use "level": 1-3 for headings).\n\n'
          systemPrompt += 'DRAWING MODIFICATIONS: If the user asks to add, create, modify, or draw elements in the drawing/canvas, politely respond that this feature is not yet available. Say: "I apologize, but I cannot create or modify drawings yet. I can only help you understand existing drawings and add text to your notes."'
        }
      } else {
        systemPrompt = 'You are an AI assistant.\n\n'
        systemPrompt += 'TEXT INSERTION: When the user asks to add text, notes, or content to the text editor, return JSON with this format:\n'
        systemPrompt += '```json\n{\n  "action": "insert_text",\n  "text": "The text content to add",\n  "blockType": "paragraph"\n}\n```\n'
        systemPrompt += 'Supported blockType: "paragraph", "heading" (use "level": 1-3 for headings).\n\n'
        systemPrompt += 'DRAWING MODIFICATIONS: If the user asks to add, create, modify, or draw elements in the drawing/canvas, politely respond that this feature is not yet available. Say: "I apologize, but I cannot create or modify drawings yet. I can only help you understand existing drawings and add text to your notes."'
      }

      const chatMessages = nextMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }))

      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          messages: chatMessages,
          system: systemPrompt,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorText = data?.error || 'Something went wrong talking to the AI service.'
        const errorMessage = {
          id: nextMessages.length + 1,
          role: 'assistant',
          content: `Error: ${errorText}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        const errorMessages = [...nextMessages, errorMessage]
        setMessages(errorMessages)
        await saveChatMessages(errorMessages)
        return
      }

      const aiContent = data?.content || 'No response from AI.'

      // Check if AI wants to insert text into notes
      const textInsertData = processTextInsertion(aiContent)
      if (textInsertData && docId) {
        try {
          // Dispatch event to trigger NotesPanel text insertion
          window.dispatchEvent(
            new CustomEvent('ai-insert-text', {
              detail: {
                text: textInsertData.text,
                blockType: textInsertData.blockType,
                level: textInsertData.level,
              },
            }),
          )

          // Show success message
          const successMessage = `Added text to your notes: "${textInsertData.text.substring(0, 50)}${textInsertData.text.length > 50 ? '...' : ''}"`

          const aiMessage = {
            id: nextMessages.length + 1,
            role: 'assistant',
            content: successMessage,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
          const finalMessages = [...nextMessages, aiMessage]
          setMessages(finalMessages)
          await saveChatMessages(finalMessages)
          return
        } catch (error) {
          console.error('[ChatBar] Failed to insert text:', error)
        }
      }

      // Regular text response
      const aiMessage = {
        id: nextMessages.length + 1,
        role: 'assistant',
        content: aiContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      const finalMessages = [...nextMessages, aiMessage]
      setMessages(finalMessages)
      await saveChatMessages(finalMessages)
    } catch (error) {
      console.error('AI request failed:', error)
      const errorMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: 'Error: Unable to reach the AI service. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      const errorMessages = [...messages, errorMessage]
      setMessages(errorMessages)
      await saveChatMessages(errorMessages)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <Stack gap={0} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <IconRobot size={20} />
            <Text size="sm" fw={500}>
              AI Assistant
            </Text>
          </Group>
          {docId && (
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon variant="transparent" size="sm">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setClearChatOpened(true)}
                  color="red"
                >
                  Clear Chat
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Paper>

      <Modal
        opened={clearChatOpened}
        onClose={() => setClearChatOpened(false)}
        title="Clear Chat"
        centered
      >
        <Text size="sm" mb="md">
          Are you sure you want to clear all chat messages? This action cannot be undone. The welcome message will be kept.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" onClick={() => setClearChatOpened(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              handleClearChat()
              setClearChatOpened(false)
            }}
          >
            Clear Chat
          </Button>
        </Group>
      </Modal>

      <ScrollArea 
        ref={scrollAreaRef}
        viewportRef={viewportRef}
        style={{ flex: 1 }} 
        p="md"
      >
        {loadingChat ? (
          <Center style={{ height: '100%' }}>
            <Loader size="sm" />
          </Center>
        ) : (
          <Stack gap="md">
            {messages.map((message) => (
            <Group
              key={message.id}
              align="flex-start"
              gap="xs"
              style={{ flexDirection: message.role === 'user' ? 'row-reverse' : 'row' }}
            >
              <Avatar size="sm" radius="xl" color={message.role === 'user' ? 'blue' : 'gray'}>
                {message.role === 'user' ? <IconUser size={16} /> : <IconRobot size={16} />}
              </Avatar>
              <Stack gap={4} style={{ flex: 1, maxWidth: '90%' }}>
                <Paper
                  p="sm"
                  style={{
                    backgroundColor:
                      message.role === 'user'
                        ? 'var(--mantine-color-blue-6)'
                        : 'var(--mantine-color-gray-1)',
                    color: message.role === 'user' ? 'white' : 'inherit',
                  }}
                  className="chat-message"
                  data-user={message.role === 'user'}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: (props) => (
                        <Text size="sm" fw={600} style={{ margin: '0 0 4px' }} {...props} />
                      ),
                      h2: (props) => (
                        <Text size="sm" fw={600} style={{ margin: '0 0 4px' }} {...props} />
                      ),
                      h3: (props) => (
                        <Text size="sm" fw={600} style={{ margin: '0 0 4px' }} {...props} />
                      ),
                      p: (props) => (
                        <Text size="sm" style={{ margin: 0 }} {...props} />
                      ),
                      li: (props) => (
                        <li style={{ fontSize: 14, marginLeft: 16 }} {...props} />
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </Paper>
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ textAlign: message.role === 'user' ? 'right' : 'left' }}
                >
                  {message.timestamp}
                </Text>
              </Stack>
            </Group>
            ))}
            {sending && (
            <Group align="flex-start" gap="xs">
              <Avatar size="sm" radius="xl" color="gray">
                <IconRobot size={16} />
              </Avatar>
              <Stack gap={4} style={{ flex: 1, maxWidth: '90%' }}>
                <Paper
                  p="sm"
                  style={{
                    backgroundColor: 'var(--mantine-color-gray-1)',
                  }}
                  className="chat-message"
                >
                  <Group gap="xs" align="center">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                      AI is thinking...
                    </Text>
                  </Group>
                </Paper>
              </Stack>
            </Group>
            )}
          </Stack>
        )}
      </ScrollArea>

      <Paper p="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap="xs">
          <TextInput
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
            size="sm"
            disabled={sending}
          />
          <ActionIcon
            variant="filled"
            color="blue"
            size="lg"
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>
      </Paper>
    </Stack>
  )
}
