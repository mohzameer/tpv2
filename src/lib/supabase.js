import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug: Log Supabase configuration (without exposing keys)
console.log('[SUPABASE] Initializing client', {
  url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING',
  hasAnonKey: !!supabaseAnonKey,
  anonKeyLength: supabaseAnonKey?.length || 0
})

if (!supabaseUrl) {
  console.error('[SUPABASE] VITE_SUPABASE_URL is not set!')
}
if (!supabaseAnonKey) {
  console.error('[SUPABASE] VITE_SUPABASE_ANON_KEY is not set!')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
