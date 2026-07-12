"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUI } from "@/lib/UIContext"

const TOP_OFFSET = 72 // matches ProfileSlideOver

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

function typeIcon(type) {
  switch (type) {
    case "waitlist_promoted": return "🎉"
    case "booking_added":     return "🙋"
    case "event_updated":     return "📅"
    case "event_cancelled":   return "❌"
    case "booking_cancelled": return "🚫"
    case "payment_confirmed": return "✅"
    case "payment_submitted": return "🧾"
    case "payment_reminder":  return "💳"
    case "bar_reconciled":    return "🧾"
    default:                  return "🔔"
  }
}

function typeColour(type) {
  switch (type) {
    case "waitlist_promoted": return "var(--teal)"
    case "booking_added":     return "var(--teal)"
    case "event_updated":     return "var(--amber-dark)"
    case "event_cancelled":   return "#e53e3e"
    case "booking_cancelled": return "#e53e3e"
    case "payment_confirmed": return "var(--teal)"
    case "payment_submitted": return "var(--teal)"
    case "payment_reminder":  return "var(--amber-dark)"
    case "bar_reconciled":    return "var(--amber-dark)"
    default:                  return "var(--text-dim)"
  }
}

export default function NotificationsDrawer() {
  const { notifOpen, closeNotif, setNotifCount, refreshNotifCount } = useUI()

  const [mounted,  setMounted]  = useState(false)
  const [animIn,   setAnimIn]   = useState(false)
  const [notifs,   setNotifs]   = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (notifOpen) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
      loadAndMarkRead()
    } else {
      setAnimIn(false)
      const t = setTimeout(() => setMounted(false), 280)
      return () => clearTimeout(t)
    }
  }, [notifOpen])

  const loadAndMarkRead = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const items = await res.json()
      setNotifs(items || [])

      // Mark all unread as read
      const unreadIds = (items || []).filter(n => !n.read_at).map(n => n.id)
      if (unreadIds.length > 0) {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ all: true }),
        })
        setNotifCount(0)
      }
    }
    setLoading(false)
  }, [setNotifCount])

  if (!mounted) return null

  const unread = notifs.filter(n => !n.read_at)
  const read   = notifs.filter(n => n.read_at)

  return (
    <>
      {/* Backdrop */}
      <div onClick={closeNotif} style={{
        position: "fixed", top: TOP_OFFSET, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 200,
        opacity: animIn ? 1 : 0, transition: "opacity 0.25s ease",
      }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: TOP_OFFSET, right: 0,
        maxHeight: `calc(100dvh - ${TOP_OFFSET}px)`,
        width: "min(400px, 100%)",
        background: "var(--surface)", zIndex: 201,
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.2)",
        transform: animIn ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "0.85rem 1rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>Notifications</div>
          <button onClick={closeNotif} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.3rem", color: "var(--text-dim)", lineHeight: 1, padding: "0.1rem 0.25rem" }} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.9rem" }}>Loading…</div>
          ) : notifs.length === 0 ? (
            <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔔</div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>You're all caught up</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>Notifications will appear here when something needs your attention — like a waitlist seat becoming available.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Unread first (will already be marked read server-side but shown distinctly until next open) */}
              {unread.length > 0 && (
                <div style={{ padding: "0.5rem 1rem 0.25rem", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>New</div>
              )}
              {notifs.map((n, i) => {
                const isNew = !n.read_at
                return (
                  <div key={n.id} style={{
                    display: "flex", gap: "0.75rem", padding: "0.85rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    background: isNew ? "rgba(0,128,128,0.04)" : "transparent",
                  }}>
                    <div style={{ fontSize: "1.4rem", flexShrink: 0, lineHeight: 1.2 }}>{typeIcon(n.type)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {n.events?.title && (
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: typeColour(n.type), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
                          {n.events.title}
                        </div>
                      )}
                      <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.45 }}>{n.message}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>{timeAgo(n.created_at)}</div>
                    </div>
                    {isNew && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)", flexShrink: 0, marginTop: 6 }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
