import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { claimGuestProjects, createUserProfile } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function handleAuthChange(session) {
    const newUser = session?.user ?? null
    setUser(newUser)
    
    // Claim guest projects when user signs in
    if (newUser) {
      try {
        await claimGuestProjects()
      } catch (err) {
        console.error('Failed to claim guest projects:', err)
      }
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session)
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
