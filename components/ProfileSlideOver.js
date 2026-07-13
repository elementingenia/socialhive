"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { BAR_ENABLED } from "@/lib/features"
import { isPushSupported, isIOS, isStandalone, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/pushClient"

// Clearance below the sticky header so the avatar pill stays visible
const TOP_OFFSET = 72 // px — covers both home (~68px) and sub-page (~43px) headers

const ALL_AVATARS = Array.from({ length: 12 }, (_, i) => `/avatars/avatar_${String(i + 1).padStart(2, "0")}.svg`)

const inputStyle = {
  width: "100%", padding: "0.55rem 0.85rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.55rem 0" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>{label}</div>
        {description && <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 13, background: value ? "var(--teal)" : "var(--border)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }} aria-checked={value} role="switch" aria-label={label}>
        <span style={{ position: "absolute", top: 3, left: value ? 20 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  )
}

// Push notifications opt-in (2026-07-14) — deliberately separate from the
// rest of the profile fields: (un)subscribing is an immediate browser/OS
// action (permission prompt, service worker registration), not something
// that waits for the Save button. Only ever renders a working toggle once
// we've confirmed the platform actually supports it; otherwise shows the
// specific reason instead of a control that would just silently fail.
function NotificationsToggle() {
  const [status, setStatus] = useState("checking") // checking | unsupported | ios-not-installed | denied | off | on | working
  const [error,  setError]  = useState(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!isPushSupported()) {
        setStatus(isIOS() && !isStandalone() ? "ios-not-installed" : "unsupported")
        return
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        setStatus("denied")
        return
      }
      const sub = await getExistingSubscription()
      if (!cancelled) setStatus(sub ? "on" : "off")
    }
    check()
    return () => { cancelled = true }
  }, [])

  async function toggle() {
    setError(null)
    setStatus("working")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (status === "on") {
        await unsubscribeFromPush(session.access_token)
        setStatus("off")
      } else {
        await subscribeToPush(session.access_token)
        setStatus("on")
      }
    } catch (e) {
      setError(e.message || "Something went wrong")
      const sub = await getExistingSubscription()
      setStatus(sub ? "on" : "off")
    }
  }

  if (status === "checking" || status === "unsupported") return null

  if (status === "ios-not-installed") {
    return (
      <>
        <div style={{ padding: "0.55rem 0" }}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>Phone alerts</div>
          <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "0.15rem", lineHeight: 1.4 }}>
            Add Social Hive to your Home Screen first (Share → Add to Home Screen), then come back here to turn this on.
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />
      </>
    )
  }

  if (status === "denied") {
    return (
      <>
        <div style={{ padding: "0.55rem 0" }}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>Phone alerts</div>
          <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "0.15rem", lineHeight: 1.4 }}>
            Notifications are blocked for Social Hive — enable them in your phone's Settings to turn this on.
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />
      </>
    )
  }

  return (
    <>
      <Toggle
        value={status === "on"}
        onChange={toggle}
        label="Phone alerts"
        description="Get a notification on this device for bookings, payments and event updates"
      />
      {error && <div style={{ fontSize: "0.74rem", color: "#e53e3e", marginTop: "-0.3rem", marginBottom: "0.3rem" }}>{error}</div>}
      <div style={{ borderTop: "1px solid var(--border)" }} />
    </>
  )
}

export default function ProfileSlideOver({ open, onClose, onSaved }) {
  const { member, refreshUser } = useUser()

  // Animation state — keep mounted briefly after close so transition plays out
  const [mounted, setMounted] = useState(false)
  const [animIn,  setAnimIn]  = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Next frame so the initial translateX(100%) is painted before we transition to 0
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
    } else {
      setAnimIn(false)
      const t = setTimeout(() => setMounted(false), 280)
      return () => clearTimeout(t)
    }
  }, [open])

  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [house,    setHouse]    = useState("")
  const [phone,    setPhone]    = useState("")
  const [hideName, setHideName] = useState(false)
  const [barOptIn, setBarOptIn] = useState(false)
  const [avatar,   setAvatar]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState(null)

  // Seed instantly from UserContext (no flicker on open)
  useEffect(() => {
    if (member) {
      setName(member.name || "")
      setBarOptIn(!!member.bar_opt_in)
      setAvatar(member.avatar_url || null)
    }
  }, [member])

  // Full fetch when panel opens (email, house_number, hide_name)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoading(false); return }
      const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) {
        const d = await res.json()
        setName(d.name || "")
        setEmail(d.email || "")
        setHouse(d.house_number || "")
        setPhone(d.phone || "")
        setHideName(!!d.hide_name)
        setBarOptIn(!!d.bar_opt_in)
        setAvatar(d.avatar_url || null)
      }
      setLoading(false)
    })
  }, [open])

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const handleSave = async () => {
    if (!name.trim()) { showToast("Display name is required", false); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), house_number: house.trim(), phone: phone.trim(), hide_name: hideName, bar_opt_in: barOptIn, avatar_url: avatar }),
    })
    setSaving(false)
    if (res.ok) {
      refreshUser?.()
      onClose?.()
      onSaved?.()
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || "Save failed — try again", false)
    }
  }

  if (!mounted) return null

  return (
    <>
      {/* Backdrop — starts below header so avatar pill stays visible */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", top: TOP_OFFSET, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 200,
          opacity: animIn ? 1 : 0, transition: "opacity 0.25s ease",
        }}
      />

      {/* Panel — slides in from right, starts below header */}
      <div style={{
        position: "fixed",
        top: TOP_OFFSET,
        right: 0,
        height: "auto",
        maxHeight: `calc(100dvh - ${TOP_OFFSET}px)`,
        width: "min(400px, 100%)",
        background: "var(--surface)",
        zIndex: 201,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.2)",
        transform: animIn ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
      }}>

        {/* Header */}
        <div style={{ padding: "0.85rem 1rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>My Profile</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.3rem", color: "var(--text-dim)", lineHeight: 1, padding: "0.1rem 0.25rem" }} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "0.9rem 1rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-dim)" }}>Loading…</div>
          ) : (
            <>
              {/* Avatar grid */}
              <div style={{ marginBottom: "0.9rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>Choose your avatar</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.35rem" }}>
                  {ALL_AVATARS.map(src => (
                    <button key={src} onClick={() => setAvatar(src)} style={{ padding: 2, borderRadius: 8, border: avatar === src ? "2.5px solid var(--teal)" : "2.5px solid transparent", background: avatar === src ? "rgba(0,128,128,0.08)" : "transparent", cursor: "pointer", lineHeight: 0 }} aria-pressed={avatar === src}>
                      <img src={src} alt="" style={{ width: "100%", borderRadius: 6, display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.3rem" }}>Display name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.3rem" }}>Email <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" type="email" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.3rem" }}>House number <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={house} onChange={e => setHouse(e.target.value)} style={inputStyle} placeholder="e.g. 14" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.3rem" }}>Phone <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="e.g. 0400 000 000" type="tel" />
                </div>
              </div>

              {/* Toggles */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem" }}>
                <NotificationsToggle />
                <Toggle value={hideName} onChange={setHideName} label="Hide my name" description="Show me as 'Resident' in event attendee lists" />
                {/* Bar access toggle parked (feature not in scope) — see lib/features.js */}
                {BAR_ENABLED && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)" }} />
                    <Toggle value={barOptIn} onChange={setBarOptIn} label="Bar access" description="Enable the Community Bar tab for your account" />
                  </>
                )}
              </div>

              {/* Save button sits immediately below content — no empty space */}
              <div style={{ paddingTop: "0.85rem" }}>
                {toast && (
                  <div style={{ marginBottom: "0.6rem", padding: "0.5rem 0.85rem", borderRadius: 8, background: toast.ok ? "var(--teal)" : "#e53e3e", color: "#fff", fontSize: "0.82rem" }}>{toast.msg}</div>
                )}
                <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "0.8rem", borderRadius: 10, background: "var(--teal)", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </>
          )}
        </div>


      </div>
    </>
  )
}
