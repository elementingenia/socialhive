"use client"
import { createContext, useContext, useState } from "react"

const UIContext = createContext({
  profileOpen: false,
  profileSection: null,
  openProfile: () => {},
  openProfileAtPin: () => {},
  closeProfile: () => {},
})

export function UIProvider({ children }) {
  const [profileOpen,    setProfileOpen]    = useState(false)
  const [profileSection, setProfileSection] = useState(null)

  function openProfile() {
    setProfileSection(null)
    setProfileOpen(true)
  }

  function openProfileAtPin() {
    setProfileSection("pin")
    setProfileOpen(true)
  }

  function closeProfile() {
    setProfileOpen(false)
    setProfileSection(null)
  }

  return (
    <UIContext.Provider value={{ profileOpen, profileSection, openProfile, openProfileAtPin, closeProfile }}>
      {children}
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
