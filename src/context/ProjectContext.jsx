import { createContext, useContext } from 'react'
import { useProject } from '../hooks/useProject'

const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const projectData = useProject()
  return (
    <ProjectContext.Provider value={projectData}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectContext() {
  const context = useContext(ProjectContext)
  return context || {}
}
