import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Anchor, Alert } from '@mantine/core'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password)
        setMessage('Check your email to confirm your account')
      } else {
        await signIn(email, password)
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
      </Paper>
    </Container>
  )
}
