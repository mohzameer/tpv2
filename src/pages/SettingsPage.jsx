import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Container, Paper, TextInput, PasswordInput, Button, Title, Stack, Alert, Group, Divider } from '@mantine/core'
import { useAuth } from '../context/AuthContext'
import { getUserProfile, updateUserProfile } from '../lib/api'

export default function SettingsPage() {
  const { user, updateProfile, signOut } = useAuth()
  const navigate = useNavigate()
  
  const [displayName, setDisplayName] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  // Load user profile on mount
  useEffect(() => {
    loadUserProfile()
  }, [user])

  async function loadUserProfile() {
    if (!user) return
    setProfileLoading(true)
    try {
      const profile = await getUserProfile()
      setDisplayName(profile?.display_name || user.email || '')
    } catch (err) {
      console.error('Failed to load profile:', err)
      setDisplayName(user.email || '')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleUpdateDisplayName(e) {
    e.preventDefault()
    if (!displayName.trim()) {
      setProfileError('Display name cannot be empty')
      return
    }

    setProfileError('')
    setProfileMessage('')
    setLoading(true)

    try {
      await updateUserProfile({ display_name: displayName.trim() })
      setProfileMessage('Display name updated successfully')
    } catch (err) {
      setProfileError(err.message || 'Failed to update display name')
    } finally {
      setLoading(false)
    }
  }

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
      setPasswordError('Passwords do not match')
      return
    }
    
    const pwdError = validatePassword(newPassword)
    if (pwdError) {
      setPasswordError(pwdError)
      return
    }
    
    setPasswordError('')
    setPasswordMessage('')
    setLoading(true)

    try {
      await updateProfile({ password: newPassword })
      setPasswordMessage('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    console.log('[SETTINGS] Sign out button clicked')
    try {
      console.log('[SETTINGS] Calling signOut()...')
      await signOut()
      console.log('[SETTINGS] Sign out successful, navigating to /login')
      // Navigate to login page after successful signout
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('[SETTINGS] Sign out failed:', err)
      // Still navigate even if there's an error
      console.log('[SETTINGS] Navigating to /login despite error')
      navigate('/login', { replace: true })
    }
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
              {profileError && <Alert color="red">{profileError}</Alert>}
              {profileMessage && <Alert color="green">{profileMessage}</Alert>}
              
              <TextInput
                label="Display Name"
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => {
                  if (e.target.value.length <= 100) {
                    setDisplayName(e.target.value)
                  }
                }}
                maxLength={100}
                disabled={profileLoading}
                description="This name will be shown to other users in shared projects"
              />
              <Button type="submit" loading={loading} disabled={!displayName.trim() || profileLoading}>
                Update Display Name
              </Button>
            </Stack>
          </form>

          <Divider my="sm" label="Change Password" labelPosition="center" />

          <form onSubmit={handleUpdatePassword}>
            <Stack>
              {passwordError && <Alert color="red">{passwordError}</Alert>}
              {passwordMessage && <Alert color="green">{passwordMessage}</Alert>}
              
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
            <Button variant="subtle" onClick={() => navigate('/app')}>
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
