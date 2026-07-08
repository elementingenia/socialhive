"use client"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { supabase } from "@/lib/supabase"

// How often to poll for new notifications while the app is open. The badge
// otherwise only ever refreshed once, on first page load — a notification
// arriving mid-session (e.g. a waitlist promotion) wouldn't show until the
// user reloaded. No realtime infra needed for this cadence.
const NOTIF_POLL_MS = 60_000

const UIContext = createContext({
  profileOpen: false, openProfile: () => {}, closeProfile: () => {},
  pinModalOpen: false, openPinModal: () => {}, closePinModal: () => {},
  notifOpen: false, openNotif: () => {}, closeNotif: () => {},
  notifCount: 0, setNotifCount: () => {}, refreshNotifCount: () => {},
})

export function UIProvider({ children }) {
  const [profileOpen,  setProfileOpen]  = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [notifOpen,    setNotifOpen]    = useState(false)
  const [notifCount,   setNotifCount]   = useState(0)

  const refreshNotifCount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return
    const items = await res.json()
    setNotifCount((items || []).filter(n => !n.read_at).length)
  }, [])

  useEffect(() => {
    const interval = setInterval(refreshNotifCount, NOTIF_POLL_MS)
    return () => clearInterval(interval)
  }, [refreshNotifCount])

  return (
    <UIContext.Provider value={{
      profileOpen,  openProfile:  () => setProfileOpen(true),  closeProfile:  () => setProfileOpen(false),
      pinModalOpen, openPinModal: () => setPinModalOpen(true), closePinModal: () => setPinModalOpen(false),
      notifOpen,    openNotif:    () => setNotifOpen(true),    closeNotif:    () => setNotifOpen(false),
      notifCount, setNotifCount, refreshNotifCount,
    }}>
      {children}
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
