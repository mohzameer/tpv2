import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { markAsLoggedIn } from '../lib/guest'
import { migrateGuestProjectsToOwner } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('[AuthContext] Initializing auth...')
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthContext] Initial session:', session?.user ? `User: ${session.user.id}` : 'No user')
      setUser(session?.user ?? null)
      if (session?.user) {
        console.log('[AuthContext] Marking user as logged in')
        markAsLoggedIn()
      }
      setLoading(false)
      console.log('[AuthContext] Auth loading complete')
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[AuthContext] Auth state changed:', _event, session?.user ? `User: ${session.user.id}` : 'No user')
      setUser(session?.user ?? null)
      if (session?.user) {
        console.log('[AuthContext] Marking user as logged in (state change)')
        markAsLoggedIn()
        // Migrate guest projects to owner on login
        try {
          console.log('[AuthContext] Migrating guest projects to owner...')
          await migrateGuestProjectsToOwner(session.user.id)
          console.log('[AuthContext] Guest projects migrated successfully')
        } catch (err) {
          console.error('[AuthContext] Failed to migrate guest projects:', err)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    markAsLoggedIn()
    // Migrate guest projects to owner on login
    if (data.user) {
      try {
        await migrateGuestProjectsToOwner(data.user.id)
      } catch (err) {
        console.error('Failed to migrate guest projects:', err)
      }
    }
    return data
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      markAsLoggedIn()
    }
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
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
