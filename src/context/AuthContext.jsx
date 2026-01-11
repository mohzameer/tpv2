import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { claimGuestProjects, createUserProfile } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef(null) // Track current user to avoid stale closures
  const projectsClaimedRef = useRef(false) // Track if we've already claimed projects for this user
  const initialSessionLoadedRef = useRef(false) // Track if initial session has been loaded

  async function handleAuthChange(session, event = null) {
    const newUser = session?.user ?? null
    const currentUser = userRef.current
    const wasLoggedIn = currentUser !== null
    const isNowLoggedOut = wasLoggedIn && !newUser
    
    // Only update user state if it actually changed (not just token refresh)
    // Compare user IDs to avoid unnecessary updates
    const userIdChanged = (currentUser?.id || null) !== (newUser?.id || null)
    
    // Skip updates for TOKEN_REFRESHED events unless user actually changed
    if (event === 'TOKEN_REFRESHED' && !userIdChanged) {
      return
    }
    
    // For SIGNED_IN events after initial session load, check if user actually changed
    // If user hasn't changed, this is likely a session recovery (tab becoming visible)
    // and we should skip claiming projects again
    if (event === 'SIGNED_IN' && initialSessionLoadedRef.current && !userIdChanged) {
      // Still update ref to keep it in sync, but don't update state or claim projects
      userRef.current = newUser
      return
    }
    
    // Update ref and state
    userRef.current = newUser
    setUser(newUser)
    
    // Reset projects claimed flag when user changes
    if (userIdChanged) {
      projectsClaimedRef.current = false
    }
    
    // Clear localStorage when user logs out to prevent data privacy issues
    if (isNowLoggedOut) {
      const LAST_VISITED_KEY = 'thinkpost_last_visited'
      localStorage.removeItem(LAST_VISITED_KEY)
      projectsClaimedRef.current = false
    }
    
    // Claim guest projects when user signs in (only once per user, not on session recovery)
    if (newUser && event === 'SIGNED_IN' && !projectsClaimedRef.current) {
      projectsClaimedRef.current = true
      try {
        await claimGuestProjects()
      } catch (err) {
        console.error('AuthContext: Failed to claim guest projects:', err)
        projectsClaimedRef.current = false // Reset on error so we can retry
      }
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session, 'INITIAL_SESSION')
      initialSessionLoadedRef.current = true
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthChange(session, event)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // claimGuestProjects will be called by handleAuthChange
    return data
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    
    // Create user profile with email if user is created
    if (data.user) {
      try {
        await createUserProfile(data.user.id, email)
      } catch (err) {
        console.error('Failed to create user profile:', err)
        // Don't throw - profile creation failure shouldn't block signup
      }
    }
    
    // claimGuestProjects will be called by handleAuthChange if user is immediately signed in
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
