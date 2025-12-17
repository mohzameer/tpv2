import { useState } from 'react'
import { Modal, TextInput, PasswordInput, Button, Text, Stack, Anchor, Alert } from '@mantine/core'
import { useAuth } from '../context/AuthContext'

export default function LoginModal({ opened, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, signUp } = useAuth()

  function validatePassword(pwd) {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number'
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must contain a symbol'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    
    if (isSignUp) {
      const pwdError = validatePassword(password)
      if (pwdError) {
        setError(pwdError)
        return
      }
    }
    
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
        setMessage('Check your email to confirm your account')
      } else {
        await signIn(email, password)
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setEmail('')
    setPassword('')
    setError('')
    setMessage('')
    setIsSignUp(false)
    onClose()
  }

  return (
    <Modal opened={opened} onClose={handleClose} title={isSignUp ? 'Create account' : 'Sign in'} centered>
      <form onSubmit={handleSubmit}>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          {message && <Alert color="green">{message}</Alert>}
          
          <TextInput
            label="Email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" fullWidth loading={loading}>
            {isSignUp ? 'Sign up' : 'Sign in'}
          </Button>
          
          <Text c="dimmed" size="sm" ta="center">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Anchor size="sm" component="button" type="button" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? 'Sign in' : 'Sign up'}
            </Anchor>
          </Text>
        </Stack>
      </form>
    </Modal>
  )
}
