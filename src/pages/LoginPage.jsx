import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Anchor, Alert } from '@mantine/core'
import { useAuth } from '../context/AuthContext'
import { getUserLastVisited, getProjects, getDocuments } from '../lib/api'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
        
        // Wait for auth session to be ready
        let session = null
        let retries = 0
        while (!session && retries < 10) {
          const { data } = await supabase.auth.getSession()
          session = data?.session
          if (!session) {
            await new Promise(resolve => setTimeout(resolve, 200))
            retries++
          }
        }
        
        if (!session) {
          console.error('LoginPage: Could not get session after login')
          return
        }
        
        console.log('LoginPage: Session ready, claimGuestProjects should have run')
        
        // Wait a bit for claimGuestProjects to complete and projects to reload
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Get user's projects (should now include claimed guest projects)
        const projects = await getProjects()
        console.log('LoginPage: Projects loaded (including claimed):', projects.length, projects.map(p => p.id))
        
        // Check if user was on a project/doc route before login (from localStorage)
        const LAST_VISITED_KEY = 'thinkpost_last_visited'
        const stored = localStorage.getItem(LAST_VISITED_KEY)
        let guestProjectId = null
        let guestDocId = null
        
        if (stored) {
          try {
            const data = JSON.parse(stored)
            guestProjectId = data.projectId || data.lastProjectId
            guestDocId = data.docId || data.lastDocId
            console.log('LoginPage: Found guest project/doc in localStorage:', guestProjectId, guestDocId)
          } catch (e) {
            console.log('LoginPage: Could not parse localStorage:', e)
          }
        }
        
        // Priority 1: If user was working on a guest project that was just claimed, stay on it
        if (guestProjectId && guestDocId) {
          const claimedProject = projects.find(p => p.id === guestProjectId)
          if (claimedProject) {
            console.log('LoginPage: Found claimed guest project:', guestProjectId)
            const docs = await getDocuments(claimedProject.id)
            const doc = docs.find(d => {
              const docIdNum = typeof d.id === 'number' ? d.id : parseInt(d.id, 10)
              const guestDocIdNum = typeof guestDocId === 'number' ? guestDocId : parseInt(guestDocId, 10)
              return docIdNum === guestDocIdNum
            })
            
            if (doc) {
              console.log('LoginPage: Staying on claimed project/doc:', claimedProject.id, doc.id)
              navigate(`/${claimedProject.id}/${doc.id}`, { replace: true })
              return
            } else if (docs.length > 0) {
              console.log('LoginPage: Guest doc not found, using first doc in claimed project')
              navigate(`/${claimedProject.id}/${docs[0].id}`, { replace: true })
              return
            }
          }
        }
        
        // Priority 2: Get last visited from user profile (for returning users)
        const lastVisited = await getUserLastVisited()
        console.log('LoginPage: Last visited from user profile:', lastVisited)
        
        if (lastVisited?.projectId && lastVisited?.docId && projects.length > 0) {
          const project = projects.find(p => p.id === lastVisited.projectId)
          if (project) {
            const docs = await getDocuments(project.id)
            const doc = docs.find(d => {
              const docIdNum = typeof d.id === 'number' ? d.id : parseInt(d.id, 10)
              const lastDocIdNum = typeof lastVisited.docId === 'number' ? lastVisited.docId : parseInt(lastVisited.docId, 10)
              return docIdNum === lastDocIdNum
            })
            
            if (doc) {
              console.log('LoginPage: Navigating to last visited from profile:', project.id, doc.id)
              navigate(`/${project.id}/${doc.id}`, { replace: true })
              return
            } else if (docs.length > 0) {
              console.log('LoginPage: Last doc not found, using first doc in project')
              navigate(`/${project.id}/${docs[0].id}`, { replace: true })
              return
            }
          }
        }
        
        // Priority 3: Navigate to first project's first document (new users or fallback)
        if (projects.length > 0) {
          const firstProject = projects[0]
          const docs = await getDocuments(firstProject.id)
          if (docs.length > 0) {
            console.log('LoginPage: Navigating to first project/doc:', firstProject.id, docs[0].id)
            navigate(`/${firstProject.id}/${docs[0].id}`, { replace: true })
            return
          }
          console.log('LoginPage: Navigating to project:', firstProject.id)
          navigate(`/${firstProject.id}`, { replace: true })
          return
        }
        
        // Should never happen, but just in case
        console.log('LoginPage: No projects found, staying on login page')
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
