# Backend API Specification - AI Provider Abstraction (Supabase Edge Functions)

## Overview

This document specifies the **Supabase Edge Functions** implementation that provides a **provider-agnostic AI service**. The backend can route requests to different AI providers (Anthropic/Claude, OpenAI/GPT, DeepSeek, etc.) based on model name or configuration, solving CORS issues and providing a unified interface.

**Note**: This spec has been repurposed from Express/Node.js to Supabase Edge Functions (Deno runtime).

## Problem Statement

AI provider APIs (Anthropic, OpenAI, DeepSeek, etc.) do not allow direct browser requests due to CORS (Cross-Origin Resource Sharing) restrictions. The frontend needs a backend proxy to:
- Make API calls server-side (no CORS restrictions)
- Keep API keys secure (not exposed in frontend code)
- Handle errors and retries server-side
- **Abstract provider differences** - frontend doesn't need to know which provider is used
- **Enable provider switching** - change providers without frontend changes

## Solution Architecture

```
Frontend (React/Vite)
    ↓ HTTP Request (provider-agnostic)
Supabase Edge Function (Deno)
    ↓ Provider Router
    ├─→ Anthropic API (Claude models)
    ├─→ OpenAI API (GPT models)
    ├─→ DeepSeek API (DeepSeek models)
    └─→ Other providers...
    ↓ Standardized Response
Supabase Edge Function (Deno)
    ↓ HTTP Response (unified format)
Frontend (React/Vite)
```

## Backend Requirements

### Technology Stack
- **Runtime**: Deno (via Supabase Edge Functions)
- **Framework**: Supabase Edge Functions (Deno Deploy)
- **HTTP Client**: Built-in `fetch` (Deno has native fetch)
- **Authentication**: Supabase Auth (JWT token verification)
- **Environment**: Supabase Secrets for API keys and configuration
- **Language**: TypeScript (Deno supports TypeScript natively)

### Project Structure
```
supabase/
├── functions/
│   └── ai-messages/
│       ├── index.ts              # Main edge function handler
│       ├── providers/
│       │   ├── anthropic.ts
│       │   ├── openai.ts
│       │   ├── deepseek.ts
│       │   └── base.ts
│       └── utils/
│           └── auth.ts           # Supabase auth verification
├── config.toml                    # Supabase config
└── .env.example                   # Environment variables template
```

## Authentication & Authorization

### Overview

The backend uses **Supabase Authentication** for user authentication. The frontend sends Supabase JWT tokens in the `Authorization` header, and the backend verifies these tokens using Supabase's JWT verification.

### Authentication Flow

```
Frontend (React)
    ↓
Supabase Auth: supabase.auth.getSession() or supabase.auth.getUser()
    ↓
HTTP Request with Authorization: Bearer <supabase-jwt-token>
    ↓
Supabase Edge Function (Deno)
    ↓
Supabase JWT Verification: verifyJWT(token)
    ↓
Extract userId from decoded token
    ↓
Process request with authenticated user context
```

### Frontend Token Retrieval

The frontend must include the Supabase JWT token in all API requests:

```typescript
import { supabase } from './lib/supabase'

// Get current user's session token
const { data: { session } } = await supabase.auth.getSession()

if (session?.access_token) {
  // Include in API requests
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`  // ← Required
    },
    body: JSON.stringify(requestBody)
  })
}
```

### Backend Token Verification

**Supabase Edge Function Auth Helper**:
```typescript
// supabase/functions/ai-messages/utils/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Verify Supabase JWT token and extract user information
 */
export async function verifySupabaseToken(
  req: Request
): Promise<{ userId: string; email?: string; error?: string }> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { 
        userId: '', 
        error: 'Missing or invalid Authorization header' 
      }
    }
    
    const token = authHeader.split('Bearer ')[1]
    
    // Create Supabase client for token verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    })
    
    // Verify token by getting user
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return { 
        userId: '', 
        error: 'Invalid or expired token' 
      }
    }
    
    return {
      userId: user.id,
      email: user.email
    }
  } catch (error) {
    console.error('[Auth] Token verification failed:', error)
    return { 
      userId: '', 
      error: 'Token verification failed' 
    }
  }
}
```

**Use in Edge Function**:
```typescript
// supabase/functions/ai-messages/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifySupabaseToken } from './utils/auth.ts'

serve(async (req) => {
  // Verify authentication
  const { userId, email, error: authError } = await verifySupabaseToken(req)
  
  if (authError || !userId) {
    return new Response(
      JSON.stringify({ error: authError || 'Unauthorized', type: 'unauthorized' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  // userId is available here
  console.log(`Request from user: ${userId}`)
  
  // ... process request
})
```

### Request Headers (All Protected Endpoints)

All API endpoints require the following header:

```
Authorization: Bearer <supabase-jwt-token>
```

**Example**:
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1NiIsInR5cCI6IkpXVCJ9...
```

**Note**: Supabase Edge Functions automatically handle CORS for requests from your Supabase project origin.

### Response Codes

- **200 OK**: Request successful, user authenticated
- **401 Unauthorized**: Missing, invalid, or expired token
- **403 Forbidden**: Token valid but user lacks permission (if implementing role-based access)

### Error Responses

**Missing Token**:
```json
{
  "error": "Missing or invalid Authorization header",
  "type": "unauthorized"
}
```

**Invalid/Expired Token**:
```json
{
  "error": "Invalid or expired token",
  "type": "unauthorized"
}
```

**Token Expired** (specific):
```json
{
  "error": "Token expired. Please refresh and try again.",
  "type": "token_expired"
}
```

### User Context in Requests

After token verification, user information is available in the edge function:

```typescript
// supabase/functions/ai-messages/index.ts
const { userId, email, error: authError } = await verifySupabaseToken(req)

if (authError || !userId) {
  // Return error response
}

// userId and email are available here
console.log(`Request from user: ${userId}`)

// Use userId for logging, rate limiting, etc.
```

### Anonymous Users

Supabase supports anonymous authentication. Anonymous users:
- Have valid Supabase JWT tokens
- Can access all API endpoints (if your business logic allows)
- Can be upgraded to registered users later (handled by frontend)

**Check if user is anonymous**:
```typescript
// In Supabase, check if user has email or is guest
const isAnonymous = !email || user.app_metadata?.provider === 'anon'
if (isAnonymous) {
  // Handle anonymous user (e.g., rate limiting, feature restrictions)
}
```

### Security Best Practices

1. **Always verify tokens server-side**: Never trust client-provided user IDs
2. **Use HTTPS in production**: Supabase Edge Functions automatically use HTTPS
3. **Token expiration**: Supabase tokens expire after 1 hour. Frontend should refresh tokens automatically
4. **Rate limiting**: Implement rate limiting per userId to prevent abuse (can use Supabase rate limiting)
5. **Logging**: Log userId with all requests for audit trails
6. **Secrets management**: Use Supabase Secrets for API keys (never commit to git)

### Environment Variables (Supabase Secrets)

Set secrets in Supabase Dashboard or via CLI:

```bash
# Set secrets via Supabase CLI
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_api_key_here
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set DEEPSEEK_API_KEY=your_deepseek_api_key_here
supabase secrets set DEFAULT_AI_MODEL=claude-sonnet-4-5-20250929
supabase secrets set DEFAULT_AI_PROVIDER=anthropic
```

**Access secrets in Edge Function**:
```typescript
// Secrets are available via Deno.env.get()
const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const defaultModel = Deno.env.get('DEFAULT_AI_MODEL') || 'claude-sonnet-4-5-20250929'
```

**Note**: Supabase automatically provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables.

### Testing Authentication

**Test with valid token**:
```bash
# Get token from frontend (browser console)
const token = await firebase.auth().currentUser.getIdToken()

# Use in curl
curl -X POST http://localhost:3001/api/ai/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

**Test without token** (should fail):
```bash
curl -X POST http://localhost:3001/api/ai/messages \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
# Expected: 401 Unauthorized
```

## API Endpoint Specification

### Endpoint: `POST /api/ai/messages`

**Purpose**: Provider-agnostic AI API endpoint that routes to appropriate provider based on model or configuration

**Authentication**: Required (Firebase ID token)

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <firebase-id-token>
```

**Request Body**:
```typescript
{
  model?: string                    // Optional, backend will use DEFAULT_AI_MODEL env var or route to appropriate provider
  max_tokens?: number               // Optional, defaults to 4096
  temperature?: number              // Optional, defaults to 0.7
  system?: string                   // Optional system message
  provider?: string                 // Optional provider hint (e.g., "anthropic", "openai", "deepseek")
  messages: Array<{
    role: "user" | "assistant" | "system"  // Required
    content: string                 // Required
  }>
}
```

**Provider & Model Abstraction**:
- Frontend can optionally specify a model in the request
- Backend automatically routes to appropriate provider based on model name or configuration
- Backend can override/route models based on configuration
- Backend uses `DEFAULT_AI_MODEL` env var if no model is provided
- Provider selection is transparent to frontend
- This allows provider/model swapping without frontend changes

**Response Headers**:
```
Content-Type: application/json
```

**Success Response** (200 OK):
```typescript
{
  content: string                   // AI response text (standardized across providers)
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  provider?: string                 // Optional: which provider was used (e.g., "anthropic", "openai")
}
```

**Error Response** (4xx/5xx):
```typescript
{
  error: string                     // Error message
  type?: string                     // Error type (optional)
  statusCode?: number               // HTTP status code (optional)
}
```

## Implementation Details

### 1. Supabase Edge Function Setup

```typescript
// supabase/functions/ai-messages/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifySupabaseToken } from './utils/auth.ts'
import { callAnthropic } from './providers/anthropic.ts'
import { callOpenAI } from './providers/openai.ts'
import { callDeepSeek } from './providers/deepseek.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const { userId, email, error: authError } = await verifySupabaseToken(req)
    
    if (authError || !userId) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized', type: 'unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const body = await req.json()
    
    // Process AI request (implementation below)
    // ...
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, type: 'unknown' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
```

### 2. Provider Abstraction Implementation

The backend implements a provider abstraction layer that routes requests to different AI providers based on model name or configuration.

#### Provider Router

```typescript
// supabase/functions/ai-messages/utils/provider.ts

/**
 * Determine which provider to use based on model name
 */
export function getProviderForModel(model: string): string {
  const modelLower = model.toLowerCase();
  
  // Anthropic/Claude models
  if (modelLower.includes('claude') || modelLower.includes('sonnet') || modelLower.includes('opus')) {
    return 'anthropic';
  }
  
  // OpenAI/GPT models
  if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('dall-e')) {
    return 'openai';
  }
  
  // DeepSeek models
  if (modelLower.includes('deepseek')) {
    return 'deepseek';
  }
  
  // Default provider from env
  return Deno.env.get('DEFAULT_AI_PROVIDER') || 'anthropic';
}

/**
 * Model abstraction: Get the model to use for this request
 */
export function getModelForRequest(requestedModel?: string): string {
  if (requestedModel) {
    return requestedModel;
  }
  return Deno.env.get('DEFAULT_AI_MODEL') || 'claude-sonnet-4-5-20250929';
}
```

#### Provider Implementations

Create provider modules in `providers/` directory:

**providers/anthropic.ts:**
```typescript
// supabase/functions/ai-messages/providers/anthropic.ts

export async function callAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { max_tokens?: number; temperature?: number; system?: string }
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      messages: messages.filter(m => m.role !== 'system'),
      ...(options.system && { system: options.system })
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Anthropic API error');
  }
  
  const data = await response.json();
  return {
    content: data.content?.map((b: any) => b.text || '').join('') || '',
    usage: data.usage ? {
      inputTokens: data.usage.input_tokens || 0,
      outputTokens: data.usage.output_tokens || 0
    } : undefined,
    provider: 'anthropic'
  };
}
```

**providers/openai.js:**
```javascript
export async function callOpenAI(apiKey, model, messages, options) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'OpenAI API error');
  }
  
  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage ? {
      inputTokens: data.usage.prompt_tokens || 0,
      outputTokens: data.usage.completion_tokens || 0
    } : undefined,
    provider: 'openai'
  };
}
```

**providers/deepseek.js:**
```javascript
export async function callDeepSeek(apiKey, model, messages, options) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'DeepSeek API error');
  }
  
  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    usage: data.usage ? {
      inputTokens: data.usage.prompt_tokens || 0,
      outputTokens: data.usage.completion_tokens || 0
    } : undefined,
    provider: 'deepseek'
  };
}
```

#### Main Endpoint Implementation

```typescript
// supabase/functions/ai-messages/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifySupabaseToken } from './utils/auth.ts'
import { getProviderForModel, getModelForRequest } from './utils/provider.ts'
import { callAnthropic } from './providers/anthropic.ts'
import { callOpenAI } from './providers/openai.ts'
import { callDeepSeek } from './providers/deepseek.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const { userId, email, error: authError } = await verifySupabaseToken(req)
    
    if (authError || !userId) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized', type: 'unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const {
      model: requestedModel,
      max_tokens = 4096,
      temperature = 0.7,
      system,
      messages,
      provider: requestedProvider
    } = await req.json()

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array is required and must not be empty' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Model abstraction: Determine which model to use
    const model = getModelForRequest(requestedModel)
    
    // Determine provider
    const provider = requestedProvider || getProviderForModel(model)

    // Get API key for provider
    let apiKey: string | undefined
    switch (provider) {
      case 'anthropic':
        apiKey = Deno.env.get('ANTHROPIC_API_KEY')
        break
      case 'openai':
        apiKey = Deno.env.get('OPENAI_API_KEY')
        break
      case 'deepseek':
        apiKey = Deno.env.get('DEEPSEEK_API_KEY')
        break
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: `${provider.toUpperCase()}_API_KEY not configured` 
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Call appropriate provider
    let result
    const options = { max_tokens, temperature, system }
    
    switch (provider) {
      case 'anthropic':
        result = await callAnthropic(apiKey, model, messages, options)
        break
      case 'openai':
        result = await callOpenAI(apiKey, model, messages, options)
        break
      case 'deepseek':
        result = await callDeepSeek(apiKey, model, messages, options)
        break
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported provider: ${provider}` }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
    }

    // Return formatted response
    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error('[Edge Function] Error:', error)
    
    // Handle network errors
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return new Response(
        JSON.stringify({ error: 'Request timed out. Please try again.', type: 'timeout' }),
        { 
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      return new Response(
        JSON.stringify({ error: 'Network error. Please check your connection.', type: 'network_error' }),
        { 
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generic error
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error', type: 'unknown' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
```

### 3. Environment Variables (Supabase Secrets)

Set secrets via Supabase CLI or Dashboard:

```bash
# Set secrets via Supabase CLI
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_api_key_here
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Default AI Model (optional, allows easy model/provider swapping without frontend changes)
# Examples: 
#   Anthropic: claude-sonnet-4-5-20250929, claude-opus-3
#   OpenAI: gpt-4, gpt-3.5-turbo, o1-preview
#   DeepSeek: deepseek-chat, deepseek-coder
supabase secrets set DEFAULT_AI_MODEL=claude-sonnet-4-5-20250929

# Default Provider (optional, used when model doesn't match any provider pattern)
supabase secrets set DEFAULT_AI_PROVIDER=anthropic
```

**Access in Edge Function**:
```typescript
// Secrets are automatically available via Deno.env.get()
const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
const defaultModel = Deno.env.get('DEFAULT_AI_MODEL') || 'claude-sonnet-4-5-20250929'
```

**Note**: Supabase automatically provides `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables in Edge Functions.

### 4. Deployment

**Deploy Edge Function**:
```bash
# Deploy the function
supabase functions deploy ai-messages

# Or deploy all functions
supabase functions deploy
```

**Local Development**:
```bash
# Start Supabase locally
supabase start

# Serve edge function locally
supabase functions serve ai-messages

# Function will be available at:
# http://localhost:54321/functions/v1/ai-messages
```

**Dependencies**: Supabase Edge Functions use Deno's import system. Dependencies are imported via URLs (ESM) and cached automatically. No `package.json` needed.

## Model Abstraction Architecture

### Overview

The backend implements a model abstraction layer that allows:
- **Easy model swapping** without frontend code changes
- **Model routing** based on business logic (user tiers, request types, etc.)
- **Centralized model configuration** via environment variables
- **Frontend flexibility** to optionally specify models

### How It Works

1. **Frontend** can optionally pass a `model` parameter in the request
2. **Backend** uses `getModelForRequest()` to determine the final model:
   - If model is provided in request → use it (or override based on routing logic)
   - If no model provided → use `DEFAULT_AI_MODEL` env var
   - Fallback to hardcoded default if env var not set
3. **Backend** makes API call with the determined model
4. **Response** is returned to frontend (model used is transparent to frontend)

### Benefits

- ✅ Change models in production by updating `DEFAULT_AI_MODEL` env var
- ✅ Route different users to different models (premium vs free)
- ✅ A/B test different models
- ✅ Switch models for maintenance/outages
- ✅ No frontend deployment needed for model changes

### Advanced Model Routing Example

```javascript
function getModelForRequest(requestedModel, userId, requestType) {
  // Premium users get better model
  if (isPremiumUser(userId)) {
    return 'claude-opus-3';
  }
  
  // Specific request types use specific models
  if (requestType === 'code-generation') {
    return 'claude-3-5-sonnet-20241022';
  }
  
  // Use requested model if provided
  if (requestedModel) {
    return requestedModel;
  }
  
  // Default from env
  return process.env.DEFAULT_AI_MODEL || 'claude-sonnet-4-5-20250929';
}
```

## Frontend Integration

### Update `claudeService.ts`

Change the API base URL to point to your backend:

```typescript
// API Configuration
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api/anthropic'

// Model abstraction: Default model can be configured via env var
// Backend will handle model selection/routing, so this is just a fallback
const DEFAULT_MODEL = import.meta.env.VITE_AI_MODEL || 'claude-sonnet-4-5-20250929'
```

### Environment Variables

Add to frontend `.env.local`:
```env
# Backend API URL
VITE_BACKEND_URL=http://localhost:3001

# Optional: Default model (backend can override this)
# VITE_AI_MODEL=claude-sonnet-4-5-20250929
```

### Update Request Function

The frontend code can remain mostly the same, but update the fetch URL:

```typescript
// Model is optional - backend will determine the final model to use
const requestBody = {
  model: options.model || DEFAULT_MODEL, // Optional, backend can override
  max_tokens: maxTokens,
  temperature,
  messages: messages.map(msg => ({
    role: msg.role === 'system' ? 'user' : msg.role,
    content: msg.content
  })),
  ...(systemMessage && { system: systemMessage })
}

const response = await fetch(`${API_BASE_URL}/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Remove x-api-key header - backend handles it
  },
  body: JSON.stringify(requestBody),
  signal: controller.signal
})
```

**Important**: 
- Remove the `x-api-key` header from frontend requests since the backend will add it
- Model parameter is optional - backend handles model selection/routing

## Error Handling

### Error Types to Handle

1. **400 Bad Request**: Invalid request body
2. **401 Unauthorized**: Invalid API key
3. **429 Too Many Requests**: Rate limit exceeded
4. **500 Internal Server Error**: Server error
5. **502/503/504**: Network/timeout errors

### Error Response Format

All errors should return:
```json
{
  "error": "Human-readable error message",
  "type": "error_type",
  "statusCode": 400
}
```

## Security Considerations

1. **API Key Security**:
   - Never expose API key in frontend code
   - Store API key in backend `.env` file
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **CORS Configuration**:
   - Configure CORS to only allow your frontend domain
   - Example:
     ```javascript
     app.use(cors({
       origin: process.env.FRONTEND_URL || 'http://localhost:5173',
       credentials: true
     }));
     ```

3. **Rate Limiting** (Optional but recommended):
   ```javascript
   import rateLimit from 'express-rate-limit';
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   
   app.use('/api/anthropic', limiter);
   ```

4. **Request Validation**:
   - Validate request body structure
   - Validate message array format
   - Sanitize inputs if needed

## Testing

### Manual Testing

1. **Test Edge Function Locally**:
   ```bash
   # Start Supabase locally
   supabase start
   
   # Serve edge function
   supabase functions serve ai-messages
   
   # Get Supabase JWT token (from frontend or Supabase dashboard)
   # Then test:
   curl -X POST http://localhost:54321/functions/v1/ai-messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
     -d '{
       "messages": [
         {"role": "user", "content": "Hello, world!"}
       ]
     }'
   ```

2. **Test Deployed Function**:
   ```bash
   # Get your Supabase project URL and anon key
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ai-messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
     -H "apikey: YOUR_SUPABASE_ANON_KEY" \
     -d '{
       "messages": [
         {"role": "user", "content": "Hello, world!"}
       ]
     }'
   ```

### Test Cases

1. ✅ Valid request with messages
2. ✅ Request with system message
3. ✅ Request with custom model/temperature
4. ✅ Request without model (uses DEFAULT_AI_MODEL)
5. ✅ Provider routing (Anthropic, OpenAI, DeepSeek)
6. ✅ Model routing/override logic
7. ✅ Explicit provider specification
8. ✅ Missing messages array (400 error)
9. ✅ Invalid API key (401 error)
10. ✅ Unsupported provider (400 error)
11. ✅ Network timeout handling
12. ✅ Rate limit handling (429 error)

## Deployment

### Production Considerations

1. **Secrets**: Set all API keys as Supabase secrets (via CLI or Dashboard)
2. **CORS**: Supabase Edge Functions handle CORS automatically for your project origin
3. **HTTPS**: Supabase Edge Functions automatically use HTTPS
4. **Error Logging**: Use `console.error()` - logs are available in Supabase Dashboard
5. **Monitoring**: Monitor via Supabase Dashboard → Edge Functions → Logs
6. **Scaling**: Supabase Edge Functions auto-scale based on demand

### Deploy to Production

```bash
# Deploy the edge function
supabase functions deploy ai-messages

# Or deploy all functions
supabase functions deploy

# Function will be available at:
# https://YOUR_PROJECT.supabase.co/functions/v1/ai-messages
```

### Production URL Format

```
https://YOUR_PROJECT_ID.supabase.co/functions/v1/ai-messages
```

**Note**: Replace `YOUR_PROJECT_ID` with your actual Supabase project reference ID.

## Integration Checklist

- [ ] Create Supabase Edge Function `ai-messages`
- [ ] Implement `verifySupabaseToken()` helper
- [ ] Implement `getModelForRequest()` and `getProviderForModel()` utilities
- [ ] Implement provider callers (`callAnthropic`, `callOpenAI`, `callDeepSeek`)
- [ ] Configure Supabase secrets (API keys, default model/provider)
- [ ] Test endpoint locally via `supabase functions serve ai-messages`
- [ ] Test model routing/override logic
- [ ] Update frontend to call `/functions/v1/ai-messages`
- [ ] Remove API keys from frontend code
- [ ] Test end-to-end from frontend
- [ ] Deploy edge function via `supabase functions deploy ai-messages`
- [ ] Update frontend production URL
- [ ] Verify model abstraction works (change `DEFAULT_AI_MODEL` secret and test)

## Next Steps

1. Create the Supabase Edge Function in `supabase/functions/ai-messages/index.ts`
2. Add provider modules (`anthropic.ts`, `openai.ts`, `deepseek.ts`)
3. Configure Supabase secrets for API keys and defaults
4. Run `supabase functions serve ai-messages` to test locally
5. Update frontend to call the edge function URL
6. Deploy with `supabase functions deploy ai-messages`
7. Monitor logs and adjust configuration as needed

---

## Export API Endpoints

### Overview

The export feature allows users to export diagram content in various formats (text, markdown, PDF). The backend handles:
1. **AI-generated context** - Derives comprehensive context from diagram nodes using AI
2. **PDF generation** - Converts text/markdown content to PDF format

**Note**: Copy as text and copy as markdown are handled client-side and don't require backend endpoints.

### Endpoint: `POST /api/export/generate-context`

**Purpose**: Generate AI-derived context from diagram nodes for export. This context is one per file and should be cached/saved by the frontend to Firestore.

**Authentication**: Required (Firebase ID token)

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <firebase-id-token>
```

**Request Body**:
```typescript
{
  nodes: Array<{
    id: string
    type?: string
    data: {
      label: string
      categories?: string[]
      tags?: Array<{ name: string; color: string }>
    }
    position?: { x: number; y: number }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    data?: {
      label?: string
    }
  }>
  fileId: string                    // For caching/reference
}
```

**Node Filtering Rules**:
- **Exclude nodes** that contain "Idea node" or "thinking node" (case-insensitive) in their label
- Only process nodes that pass the filter

**Processing Steps**:
1. Filter out excluded nodes (Idea node, thinking node)
2. Build an outline of all remaining nodes with their content
3. Include edge relationships and labels
4. Send outline to AI to generate comprehensive context
5. Return the AI-generated context

**Response Headers**:
```
Content-Type: application/json
```

**Success Response** (200 OK):
```typescript
{
  context: string                   // AI-generated comprehensive context
  outline?: string                  // Optional: the raw outline sent to AI (for debugging)
  nodeCount: number                 // Number of nodes processed (after filtering)
  edgeCount: number                 // Number of edges processed
}
```

**Error Response** (4xx/5xx):
```typescript
{
  error: string
  type?: string
  statusCode?: number
}
```

**Example Request**:
```json
{
  "nodes": [
    {
      "id": "node1",
      "type": "rectangle",
      "data": {
        "label": "Main Concept: Machine Learning"
      },
      "position": { "x": 100, "y": 200 }
    },
    {
      "id": "node2",
      "type": "circle",
      "data": {
        "label": "Idea node: Random thought"
      }
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "source": "node1",
      "target": "node2",
      "data": {
        "label": "relates to"
      }
    }
  ],
  "fileId": "file123"
}
```

**Example Response**:
```json
{
  "context": "# Machine Learning Overview\n\nThis diagram explores the concept of Machine Learning...",
  "nodeCount": 1,
  "edgeCount": 1
}
```

**Implementation Notes**:
- Use the same AI provider abstraction as `/api/ai/messages`
- System prompt should instruct AI to create comprehensive, well-structured summaries
- If AI fails, fallback to returning the raw outline
- Consider caching results per fileId to avoid regenerating context unnecessarily

---

### Endpoint: `POST /api/export/generate-pdf`

**Purpose**: Convert text or markdown content to PDF format for download.

**Authentication**: Required (Firebase ID token)

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer <firebase-id-token>
```

**Request Body**:
```typescript
{
  content: string                   // Text or markdown content to convert
  format: "text" | "markdown"      // Format of the input content
  title?: string                    // Optional: PDF title
  fileName?: string                 // Optional: suggested filename (default: "export.pdf")
}
```

**Response Headers**:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="export.pdf"
```

**Success Response** (200 OK):
- Binary PDF file content

**Error Response** (4xx/5xx):
```typescript
{
  error: string
  type?: string
  statusCode?: number
}
```

**Example Request**:
```json
{
  "content": "# My Document\n\nThis is the content...",
  "format": "markdown",
  "title": "My Export",
  "fileName": "my-export.pdf"
}
```

**Implementation Notes**:
- Use a PDF generation library like `pdfkit`, `puppeteer`, or `jsPDF` (server-side)
- For markdown, convert to HTML first, then to PDF
- Support proper formatting: headings, lists, code blocks, etc.
- Set appropriate page margins and styling
- Handle long content with page breaks

**Recommended Libraries**:
- **pdfkit** (Node.js): Good for programmatic PDF generation
- **puppeteer** (Node.js): Renders HTML/CSS to PDF (best for markdown)
- **marked** + **puppeteer**: Convert markdown → HTML → PDF

**Example Implementation (using puppeteer)**:
```javascript
import puppeteer from 'puppeteer';
import { marked } from 'marked';

app.post('/api/export/generate-pdf', async (req, res) => {
  try {
    const { content, format, title, fileName } = req.body;
    
    let html = '';
    if (format === 'markdown') {
      html = marked(content);
    } else {
      html = `<pre>${content}</pre>`;
    }
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${title || 'Export'}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1, h2, h3 { color: #333; }
            pre { background: #f5f5f5; padding: 10px; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `;
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(fullHtml);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'export.pdf'}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Export Feature Frontend Integration

### Client-Side Functions (No Backend Required)

1. **Copy as Text**: 
   - Simply copy the context string to clipboard using `navigator.clipboard.writeText()`
   - No backend call needed

2. **Copy as Markdown**:
   - If context is already markdown, copy directly
   - If context is plain text, wrap in markdown code blocks or convert
   - Use `navigator.clipboard.writeText()` with markdown content

3. **Download PDF**:
   - Call `POST /api/export/generate-pdf` with content and format
   - Receive PDF binary response
   - Create blob and trigger download

### Context Caching

- **Save context to Firestore**: After generating context, save it to the file document's `exportContext` field
- **Check cache first**: Before calling `/api/export/generate-context`, check if `exportContext` exists in Firestore
- **Regenerate on demand**: Provide option to regenerate context if diagram has changed
- **One context per file**: Context is stored at the file level, not per sub-item

### Frontend Flow

```
1. User clicks Export button
2. Check Firestore for existing exportContext
3. If exists:
   - Use cached context
4. If not exists or user requests regeneration:
   - Call POST /api/export/generate-context with nodes/edges
   - Save response.context to Firestore exportContext field
   - Use the context
5. Show modal with context in textarea
6. User clicks action button:
   - Copy as Text: navigator.clipboard.writeText(context)
   - Copy as Markdown: navigator.clipboard.writeText(markdownContext)
   - Download PDF: POST /api/export/generate-pdf → download blob
```



