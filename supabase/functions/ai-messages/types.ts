export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: Role
  content: string
}

export interface AIUsage {
  inputTokens: number
  outputTokens: number
}

export interface AIResult {
  content: string
  usage?: AIUsage
  provider?: string
}
