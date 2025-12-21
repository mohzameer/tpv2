import { Routes, Route } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import DocumentPage from './pages/DocumentPage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/:projectId" element={<ProjectPage />} />
          <Route path="/:projectId/:docId" element={<DocumentPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
