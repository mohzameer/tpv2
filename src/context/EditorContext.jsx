import { createContext, useContext, useState } from 'react'

const EditorContext = createContext(null)

export function EditorProvider({ children }) {
  const [editor, setEditor] = useState(null)

  return (
    <EditorContext.Provider value={{ editor, setEditor }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const context = useContext(EditorContext)
  return context
}
