import { Center, Loader } from '@mantine/core'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { loading } = useAuth()

  // Allow both authenticated users and guests to access
  // Guests can use the app without logging in
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  return <Outlet />
}
