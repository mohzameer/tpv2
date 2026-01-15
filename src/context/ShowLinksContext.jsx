import { createContext, useContext, useState, useEffect } from 'react'

const ShowLinksContext = createContext(null)

const STORAGE_KEY = 'thinkpost_show_links'

export function ShowLinksProvider({ children }) {
  const [showLinks, setShowLinks] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== null ? stored === 'true' : true // Default to true (show links)
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(showLinks))
  }, [showLinks])

  return (
    <ShowLinksContext.Provider value={{ showLinks, setShowLinks }}>
      {children}
    </ShowLinksContext.Provider>
  )
}

export function useShowLinks() {
  const context = useContext(ShowLinksContext)
  if (!context) {
    throw new Error('useShowLinks must be used within ShowLinksProvider')
  }
  return [context.showLinks, context.setShowLinks]
}
