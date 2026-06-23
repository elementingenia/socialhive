"use client"
import { createContext, useContext, useState } from "react"

const UIContext = createContext({
  profileOpen:    false,
  openProfile:    () => {},
  closeProfile:   () => {},
})

export function UIProvider({ children }) {
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <UIContext.Provider value={{
      profileOpen,
      openProfile:  () => setProfileOpen(true),
      closeProfile: () => setProfileOpen(false),
    }}>
      {children}
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
