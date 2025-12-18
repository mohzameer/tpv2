import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0'

export async function verifySupabaseToken(req: Request): Promise<{
  userId: string
  email?: string
  error?: string
}> {
  try {
    const authHeader = req.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        userId: '',
        error: 'Missing or invalid Authorization header',
      }
    }

    const token = authHeader.split('Bearer ')[1]

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        userId: '',
        error: 'Supabase URL or anon key not configured',
      }
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return {
        userId: '',
        error: 'Invalid or expired token',
      }
    }

    return {
      userId: user.id,
      email: user.email ?? undefined,
    }
  } catch (error) {
    console.error('[Auth] Token verification failed:', error)
    return {
      userId: '',
      error: 'Token verification failed',
    }
  }
}
