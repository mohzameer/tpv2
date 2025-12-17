import { createContext, useContext, useState } from 'react'

const SyncContext = createContext(null)

export function SyncProvider({ children }) {
  const [isSyncing, setIsSyncing] = useState(false)

  return (
    <SyncContext.Provider value={{ isSyncing, setIsSyncing }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext)
}
