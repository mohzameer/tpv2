import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App.jsx'
import './index.css'
import { ProjectProvider } from './context/ProjectContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { SyncProvider } from './context/SyncContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { EditorProvider } from './context/EditorContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SyncProvider>
            <ProjectProvider>
              <EditorProvider>
                <App />
              </EditorProvider>
            </ProjectProvider>
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
