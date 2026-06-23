"use client"
import { createContext, useContext, useState } from "react"

const UIContext = createContext({
  profileOpen: false, openProfile: () => {}, closeProfile: () => {},
  pinModalOpen: false, openPinModal: () => {}, closePinModal: () => {},
})

export function UIProvider({ children }) {
  const [profileOpen,  setProfileOpen]  = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)

  return (
    <UIContext.Provider value={{
      profileOpen,  openProfile:  () => setProfileOpen(true),  closeProfile:  () => setProfileOpen(false),
      pinModalOpen, openPinModal: () => setPinModalOpen(true), closePinModal: () => setPinModalOpen(false),
    }}>
      {children}
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
