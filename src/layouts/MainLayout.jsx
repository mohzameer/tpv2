import { Outlet } from 'react-router-dom'
import { AppShell } from '@mantine/core'
import Header from '../components/Header'

export default function MainLayout() {
  return (
    <AppShell
      header={{ height: 50 }}
      padding={0}
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>

      <AppShell.Main style={{ height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
