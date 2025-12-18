import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifySupabaseToken } from './utils/auth.ts'
import { getModelForRequest } from './utils/provider.ts'
import { callGemini } from './providers/gemini.ts'
import type { ChatMessage } from './types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AIRequestBody {
  model?: string
  max_tokens?: number
  temperature?: number
  system?: string
  messages: ChatMessage[]
  debug?: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, email, error: authError } = await verifySupabaseToken(req)

    if (authError || !userId) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized', type: 'unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const body = (await req.json()) as AIRequestBody

    const {
      model: requestedModel,
      max_tokens = 4096,
      temperature = 0.7,
      system,
      messages,
      debug = false,
    } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array is required and must not be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const model = getModelForRequest(requestedModel)

    const apiKey = Deno.env.get('GEMINI_API_KEY') ?? undefined
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const options = { max_tokens, temperature, system }
    const result = await callGemini(apiKey, model, messages, options, debug)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[Edge Function] Error:', error)

    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return new Response(
        JSON.stringify({ error: 'Request timed out. Please try again.', type: 'timeout' }),
        {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return new Response(
        JSON.stringify({ error: 'Network error. Please check your connection.', type: 'network_error' }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error', type: 'unknown' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
