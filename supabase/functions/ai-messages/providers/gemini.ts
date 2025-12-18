import type { ChatMessage } from '../types.ts'

interface GeminiOptions {
  max_tokens?: number
  temperature?: number
  system?: string
}

export async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: GeminiOptions,
  debug = false,
) {
  const contents: any[] = []

  if (options.system) {
    contents.push({
      role: 'user',
      parts: [{ text: options.system }],
    })
  }

  for (const m of messages) {
    const role = m.role === 'system' ? 'user' : m.role
    const mappedRole = role === 'assistant' ? 'model' : 'user'

    contents.push({
      role: mappedRole,
      parts: [{ text: m.content }],
    })
  }

  const payload: any = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.max_tokens ?? 4096,
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Gemini API error')
  }

  const data = await response.json()

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p.text === 'string' ? p.text : ''))
      .join('') ?? ''

  const result: any = {
    content: text,
    usage: undefined,
    provider: 'gemini',
  }

  if (debug) {
    result.debug = {
      payload,
    }
  }

  return result
}
