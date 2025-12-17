import { Routes, Route } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import DocumentPage from './pages/DocumentPage'

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/:projectId" element={<ProjectPage />} />
        <Route path="/:projectId/:docId" element={<DocumentPage />} />
      </Route>
    </Routes>
  )
}

export default App
