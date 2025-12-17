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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SyncProvider>
          <ProjectProvider>
            <App />
          </ProjectProvider>
        </SyncProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
