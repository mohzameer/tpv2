import { Outlet } from 'react-router-dom'
import { AppShell } from '@mantine/core'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import { useState, useEffect } from 'react'

const SIDEBAR_KEY = 'thinkpost_sidebar_open'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    return stored === null ? true : stored === 'true'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen))
  }, [sidebarOpen])
  const [mode, setMode] = useState('both') // 'notes' | 'drawing' | 'both'

  return (
    <AppShell
      header={{ height: 50 }}
      navbar={{ 
        width: 250, 
        breakpoint: 'sm', 
        collapsed: { mobile: !sidebarOpen, desktop: !sidebarOpen } 
      }}
      padding={0}
    >
      <AppShell.Header>
        <Header 
          sidebarOpen={sidebarOpen} 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          mode={mode}
          onModeChange={(newMode) => {
            setMode(newMode)
            // Dispatch event for DocumentPage to handle
            window.dispatchEvent(new CustomEvent('modeChange', { detail: newMode }))
          }}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar onCollapse={() => setSidebarOpen(false)} />
      </AppShell.Navbar>

      <AppShell.Main style={{ height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
        <Outlet context={{ mode, setMode }} />
      </AppShell.Main>
    </AppShell>
  )
}
