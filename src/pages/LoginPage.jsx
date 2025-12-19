import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Anchor, Alert } from '@mantine/core'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, signUp, user } = useAuth()
  const navigate = useNavigate()
  
  // Navigate to /app when user becomes authenticated
  useEffect(() => {
    if (user && !loading) {
      console.log('[LOGIN PAGE] User detected, navigating to /app')
      navigate('/app', { replace: true })
    }
  }, [user, navigate, loading])

  async function handleSubmit(e) {
    e.preventDefault()
    console.log('[LOGIN PAGE] Form submitted', { isSignUp, email: email.substring(0, 5) + '...', hasPassword: !!password })
    
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isSignUp) {
        console.log('[LOGIN PAGE] Attempting sign up...')
        await signUp(email, password)
        console.log('[LOGIN PAGE] Sign up successful')
        setMessage('Check your email to confirm your account')
      } else {
        console.log('[LOGIN PAGE] Attempting sign in...')
        try {
          const result = await signIn(email, password)
          console.log('[LOGIN PAGE] signIn() returned, result:', result)
          
          // Verify user is authenticated immediately
          const { data: { user: currentUser }, error: getUserError } = await supabase.auth.getUser()
          console.log('[LOGIN PAGE] Current user from supabase:', currentUser ? { id: currentUser.id, email: currentUser.email } : 'null')
          if (getUserError) {
            console.error('[LOGIN PAGE] Error getting user:', getUserError)
          }
          
          if (currentUser) {
            console.log('[LOGIN PAGE] User confirmed, navigating immediately')
            navigate('/app', { replace: true })
          } else {
            console.log('[LOGIN PAGE] User not yet available, will navigate when user state updates')
            // The useEffect above will handle navigation when user state updates
          }
        } catch (signInErr) {
          console.error('[LOGIN PAGE] signIn() threw error:', signInErr)
          throw signInErr // Re-throw to be caught by outer catch
        }
      }
    } catch (err) {
      console.error('[LOGIN PAGE] Error during login/signup:', err)
      console.error('[LOGIN PAGE] Error details:', {
        message: err.message,
        status: err.status,
        name: err.name,
        stack: err.stack
      })
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
      console.log('[LOGIN PAGE] Form submission complete')
    }
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" fw={600}>
        {isSignUp ? 'Create account' : 'Welcome back'}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <Anchor size="sm" component="button" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Sign in' : 'Sign up'}
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            {error && <Alert color="red">{error}</Alert>}
            {message && <Alert color="green">{message}</Alert>}
            
            <TextInput
              label="Email"
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              onChange={(e) => {
                if (e.target.value.length <= 254) {
                  setEmail(e.target.value)
                }
              }}
              maxLength={254}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              value={password}
              onChange={(e) => {
                if (e.target.value.length <= 128) {
                  setPassword(e.target.value)
                }
              }}
              maxLength={128}
            />
            <Button type="submit" fullWidth loading={loading}>
              {isSignUp ? 'Sign up' : 'Sign in'}
            </Button>
          </Stack>
        </form>
        
        <Stack mt="md">
          <Text ta="center" size="sm" c="dimmed">or</Text>
          <Button 
            variant="light" 
            fullWidth 
            onClick={() => {
              console.log('[LOGIN] Try the app button clicked, navigating to /app')
              navigate('/app')
            }}
          >
            Try the app
          </Button>
        </Stack>
      </Paper>
    </Container>
  )
}
