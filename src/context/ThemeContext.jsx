import { createContext, useContext, useState, useEffect } from 'react'
import { MantineProvider } from '@mantine/core'

const ThemeContext = createContext(null)

const THEME_KEY = 'thinkpost_theme'

export function ThemeProvider({ children }) {
  const [colorScheme, setColorScheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'light'
  })

  useEffect(() => {
    localStorage.setItem(THEME_KEY, colorScheme)
  }, [colorScheme])

  function toggleColorScheme() {
    setColorScheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ colorScheme, toggleColorScheme }}>
      <MantineProvider forceColorScheme={colorScheme}>
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
