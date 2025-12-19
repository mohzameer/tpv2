import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('[AUTH] Initializing auth context...')
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log('[AUTH] Initial session check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        error: error?.message
      })
      
      if (error) {
        console.error('[AUTH] Error getting initial session:', error)
      }
      
      setUser(session?.user ?? null)
      setLoading(false)
      
      // If user just signed in, initialize localStorage and claim guest projects
      if (session?.user) {
        console.log('[AUTH] Initial session has user, initializing...')
        // Initialize localStorage variables if they don't exist
        const { getGuestId } = await import('../lib/guest')
        const GUEST_ID_KEY = 'thinkpost_guest_id'
        const LAST_VISITED_KEY = 'thinkpost_last_visited'
        
        // Check if guest_id existed before (user was previously a guest)
        const hadGuestIdBefore = !!localStorage.getItem(GUEST_ID_KEY)
        
        // Ensure guest_id exists (needed for creating new projects)
        if (!localStorage.getItem(GUEST_ID_KEY)) {
          getGuestId() // This will create it if it doesn't exist
        }
        
        // Initialize last_visited if it doesn't exist (empty object)
        if (!localStorage.getItem(LAST_VISITED_KEY)) {
          localStorage.setItem(LAST_VISITED_KEY, JSON.stringify({ projects: {} }))
        }
        
        // Only claim guest projects if user was previously a guest (had guest_id before)
        // Fresh logins don't need claiming
        if (hadGuestIdBefore) {
          console.log('[AUTH] User had guest_id before - checking for guest projects to claim...')
          const { claimGuestProjects } = await import('../lib/api')
          claimGuestProjects()
            .then(result => {
              console.log('[AUTH] Guest projects claim completed:', result)
              if (result.claimed > 0) {
                console.log(`[AUTH] Claimed ${result.claimed} guest project(s)`)
              }
            })
            .catch(err => {
              console.error('[AUTH] Failed to claim guest projects:', err)
            })
        } else {
          console.log('[AUTH] Fresh login - no guest_id existed, skipping project claiming')
        }
        console.log('[AUTH] Initial session setup complete')
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AUTH] Auth state change:', { event, hasUser: !!session?.user, userId: session?.user?.id })
      setUser(session?.user ?? null)
      
      // When user signs in or signs up, initialize localStorage and claim guest projects
      if ((event === 'SIGNED_IN' || event === 'SIGNED_UP') && session?.user) {
        console.log('[AUTH] User signed in/up, initializing localStorage...')
        // Initialize localStorage variables if they don't exist
        const { getGuestId } = await import('../lib/guest')
        const GUEST_ID_KEY = 'thinkpost_guest_id'
        const LAST_VISITED_KEY = 'thinkpost_last_visited'
        
        // Check if guest_id existed before (user was previously a guest)
        const hadGuestIdBefore = !!localStorage.getItem(GUEST_ID_KEY)
        
        // Ensure guest_id exists (needed for creating new projects)
        if (!localStorage.getItem(GUEST_ID_KEY)) {
          getGuestId() // This will create it if it doesn't exist
        }
        
        // Initialize last_visited if it doesn't exist (empty object)
        if (!localStorage.getItem(LAST_VISITED_KEY)) {
          localStorage.setItem(LAST_VISITED_KEY, JSON.stringify({ projects: {} }))
        }
        
        // Only claim guest projects if user was previously a guest (had guest_id before login)
        // Fresh logins don't need claiming
        if (hadGuestIdBefore) {
          console.log('[AUTH] User had guest_id before login - checking for guest projects to claim...')
          const { claimGuestProjects } = await import('../lib/api')
          // Don't await - let it run in background so navigation isn't blocked
          claimGuestProjects()
            .then(result => {
              console.log('[AUTH] Guest projects claim result:', result)
              if (result.claimed > 0) {
                console.log(`[AUTH] Claimed ${result.claimed} guest project(s)`)
              } else {
                console.log('[AUTH] No guest projects to claim (or already claimed)')
              }
            })
            .catch(err => {
              console.error('[AUTH] Failed to claim guest projects:', err)
            })
        } else {
          console.log('[AUTH] Fresh login - no guest_id existed, skipping project claiming')
        }
        console.log('[AUTH] Sign in/up initialization complete')
      }
      
      // When user signs out, ensure state is cleared
      if (event === 'SIGNED_OUT') {
        console.log('[AUTH] SIGNED_OUT event received')
        setUser(null)
        
        // Clear localStorage session data (already done in signOut, but double-check here)
        const GUEST_ID_KEY = 'thinkpost_guest_id'
        const LAST_VISITED_KEY = 'thinkpost_last_visited'
        
        // Only clear if not already cleared (in case signOut wasn't called)
        if (localStorage.getItem(GUEST_ID_KEY)) {
          console.log('[AUTH] Clearing guest_id from localStorage')
          localStorage.removeItem(GUEST_ID_KEY)
        }
        if (localStorage.getItem(LAST_VISITED_KEY)) {
          console.log('[AUTH] Clearing last_visited from localStorage')
          localStorage.removeItem(LAST_VISITED_KEY)
        }
        console.log('[AUTH] Signout cleanup complete')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    console.log('[AUTH] signIn called', { email: email.substring(0, 5) + '...', hasPassword: !!password })
    try {
      console.log('[AUTH] Calling supabase.auth.signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        console.error('[AUTH] Sign in error:', error)
        console.error('[AUTH] Error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        })
        throw error
      }
      
      console.log('[AUTH] Sign in successful, data:', {
        user: data?.user ? { id: data.user.id, email: data.user.email } : null,
        session: data?.session ? 'exists' : 'null'
      })
      
      return data
    } catch (err) {
      console.error('[AUTH] signIn failed:', err)
      throw err
    }
  }

  async function signUp(email, password) {
    console.log('[AUTH] signUp called', { email: email.substring(0, 5) + '...', hasPassword: !!password })
    try {
      console.log('[AUTH] Calling supabase.auth.signUp...')
      const { data, error } = await supabase.auth.signUp({ email, password })
      
      if (error) {
        console.error('[AUTH] Sign up error:', error)
        console.error('[AUTH] Error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        })
        throw error
      }
      
      console.log('[AUTH] Sign up successful, data:', {
        user: data?.user ? { id: data.user.id, email: data.user.email } : null,
        session: data?.session ? 'exists' : 'null'
      })
      
      return data
    } catch (err) {
      console.error('[AUTH] signUp failed:', err)
      throw err
    }
  }

  async function signOut() {
    console.log('[SIGNOUT] Starting signout process...')
    try {
      // Clear localStorage first (before signout completes)
      // This ensures guest_id is cleared before any re-initialization happens
      const GUEST_ID_KEY = 'thinkpost_guest_id'
      const LAST_VISITED_KEY = 'thinkpost_last_visited'
      
      console.log('[SIGNOUT] Clearing localStorage...')
      const hadGuestId = !!localStorage.getItem(GUEST_ID_KEY)
      const hadLastVisited = !!localStorage.getItem(LAST_VISITED_KEY)
      
      localStorage.removeItem(GUEST_ID_KEY)
      localStorage.removeItem(LAST_VISITED_KEY)
      
      console.log('[SIGNOUT] localStorage cleared:', { hadGuestId, hadLastVisited })
      
      // Then sign out from Supabase
      console.log('[SIGNOUT] Calling supabase.auth.signOut()...')
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[SIGNOUT] Sign out error:', error)
        throw error
      }
      
      console.log('[SIGNOUT] Supabase signout successful')
      console.log('[SIGNOUT] State will be updated via onAuthStateChange listener')
      
      // State will be updated via onAuthStateChange listener
      // Components should handle navigation after signOut completes
      return { success: true }
    } catch (err) {
      console.error('[SIGNOUT] Failed to sign out:', err)
      throw err
    }
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase.auth.updateUser(updates)
    if (error) throw error
    return data
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
