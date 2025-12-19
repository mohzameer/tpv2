import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import DocumentPage from './pages/DocumentPage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <Routes>
      {/* Default route redirects to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      {/* App routes - accessible to both guests and authenticated users */}
      <Route element={<MainLayout />}>
        <Route path="/app" element={<HomePage />} />
        <Route path="/app/:projectId" element={<ProjectPage />} />
        <Route path="/app/:projectId/:docId" element={<DocumentPage />} />
      </Route>
    </Routes>
  )
}

export default App
