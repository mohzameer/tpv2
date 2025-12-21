import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Paper, TextInput, PasswordInput, Button, Title, Stack, Alert, Group, Divider } from '@mantine/core'
import { useAuth } from '../context/AuthContext'
import { getUserProfile, updateUserDisplayName } from '../lib/api'

export default function SettingsPage() {
  const { user, updateProfile, signOut } = useAuth()
  const navigate = useNavigate()
  
  const [displayName, setDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadProfile() {
      if (!user) return
      try {
        const profile = await getUserProfile()
        if (profile?.display_name) {
          setDisplayName(profile.display_name)
        }
      } catch (err) {
        console.error('Failed to load profile:', err)
      } finally {
        setLoadingProfile(false)
      }
    }
    loadProfile()
  }, [user])

  function validatePassword(pwd) {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (pwd.length > 128) return 'Password must be at most 128 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number'
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return 'Password must contain a symbol'
    return null
  }

  async function handleUpdatePassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    const pwdError = validatePassword(newPassword)
    if (pwdError) {
      setError(pwdError)
      return
    }
    
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await updateProfile({ password: newPassword })
      setMessage('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateDisplayName(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await updateUserDisplayName(displayName.trim())
      setMessage('Display name updated successfully')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <Container size={500} my={40}>
      <Title fw={600} mb="lg">Settings</Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <Stack>
          <TextInput
            label="Email"
            value={user?.email || ''}
            disabled
          />

          <Divider my="sm" label="Profile" labelPosition="center" />

          <form onSubmit={handleUpdateDisplayName}>
            <Stack>
              <TextInput
                label="Display Name"
                placeholder="Enter your display name"
                value={displayName}
                onChange={(e) => {
                  if (e.target.value.length <= 100) {
                    setDisplayName(e.target.value)
                  }
                }}
                maxLength={100}
                disabled={loadingProfile}
              />
              <Button type="submit" loading={loading} disabled={loadingProfile}>
                Update Display Name
              </Button>
            </Stack>
          </form>

          <Divider my="sm" label="Change Password" labelPosition="center" />

          <form onSubmit={handleUpdatePassword}>
            <Stack>
              {error && <Alert color="red">{error}</Alert>}
              {message && <Alert color="green">{message}</Alert>}
              
              <PasswordInput
                label="New Password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => {
                  if (e.target.value.length <= 128) {
                    setNewPassword(e.target.value)
                  }
                }}
                maxLength={128}
              />
              <PasswordInput
                label="Confirm Password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  if (e.target.value.length <= 128) {
                    setConfirmPassword(e.target.value)
                  }
                }}
                maxLength={128}
              />
              <Button type="submit" loading={loading} disabled={!newPassword}>
                Update Password
              </Button>
            </Stack>
          </form>

          <Divider my="sm" />

          <Group justify="space-between">
            <Button variant="subtle" onClick={() => navigate('/')}>
              Back to App
            </Button>
            <Button color="red" variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  )
}
