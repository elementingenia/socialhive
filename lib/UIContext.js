"use client"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { getAuthToken } from "@/lib/getAuthToken"

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

  // Uses getAuthToken() (proactive expiry check + refresh), not the plain
  // authedFetch() every user-initiated action in this app uses -- authedFetch
  // hard-redirects to /login on a persistent 401, which is the right call
  // for something the resident explicitly tapped, but wrong for a silent
  // background badge poll: it would yank someone away from whatever they're
  // doing over a background request they never asked for. This still gets
  // the same proactive-refresh benefit without that side effect.
  const refreshNotifCount = useCallback(async () => {
    const token = await getAuthToken()
    if (!token) return
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const items = await res.json()
    setNotifCount((items || []).filter(n => !n.read_at).length)
  }, [])

  // Bug found 2026-07-15 (Iain: manually sent himself a book-return
  // reminder, saw no badge even after logging out and back in): this effect
  // only ever set up the 60s poll interval -- it never called
  // refreshNotifCount() once up front. A brand-new page load (or a fresh
  // login) sat on the initial notifCount=0 default for a full minute before
  // the first real check ever ran, so anything that arrived just before or
  // during that first minute simply wasn't reflected yet.
  useEffect(() => {
    refreshNotifCount()
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
