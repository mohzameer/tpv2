export function getModelForRequest(requestedModel?: string): string {
  if (requestedModel) return requestedModel
  // Default to a Gemini model
  return Deno.env.get('DEFAULT_AI_MODEL') || 'gemini-1.5-pro'
}
