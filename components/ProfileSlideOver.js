"use client"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

const AVATARS = Array.from({ length: 12 }, (_, i) => `/avatars/avatar_${String(i + 1).padStart(2, "0")}.svg`)

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit",
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.75rem 0" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{label}</div>
        {description && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 50, height: 28, borderRadius: 14, flexShrink: 0,
          background: value ? "var(--teal)" : "var(--border)",
          border: "none", cursor: "pointer", position: "relative",
          transition: "background 0.2s",
        }}
        aria-label={label}
        aria-checked={value}
        role="switch"
      >
        <span style={{
          position: "absolute", top: 3,
          left: value ? 23 : 3,
          width: 22, height: 22, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  )
}

export default function ProfileSlideOver({ open, onClose, onSaved }) {
  const [name,      setName]      = useState("")
  const [email,     setEmail]     = useState("")
  const [houseNo,   setHouseNo]   = useState("")
  const [hideName,  setHideName]  = useState(false)
  const [barOptIn,  setBarOptIn]  = useState(false)
  const [avatarUrl, setAvatarUrl] = useState("")
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState(null)
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    if (open && !loaded) loadProfile()
  }, [open])

  async function loadProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch("/api/profile", {
      headers: { Authorization: "Bearer " + session.access_token }
    })
    const data = await res.json()
    setName(data.name || "")
    setEmail(data.email || "")
    setHouseNo(data.house_number || "")
    setHideName(data.hide_name || false)
    setBarOptIn(data.bar_opt_in || false)
    setAvatarUrl(data.avatar_url || "")
    setLoaded(true)
  }

  async function save() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ name, email: email || null, house_number: houseNo || null, hide_name: hideName, bar_opt_in: barOptIn, avatar_url: avatarUrl || null }),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      showToast("Profile saved")
      onSaved?.(data)
    } else {
      showToast("Save failed — try again", true)
    }
  }

  function showToast(msg, error = false) {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 3000)
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 200, backdropFilter: "blur(2px)",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(420px, 100vw)",
        background: "var(--bg)", zIndex: 201,
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.18)",
        animation: "slideInRight 0.22s ease-out",
      }}>
        {/* Header */}
        <div style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>My Profile</div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "1.4rem", color: "var(--text-dim)", lineHeight: 1,
              padding: "0.25rem", borderRadius: "6px",
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)",
            background: toast.error ? "var(--danger)" : "var(--teal)", color: "#fff",
            padding: "0.55rem 1.1rem", borderRadius: 10,
            fontSize: "0.85rem", fontWeight: 600, zIndex: 10,
            whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          }}>{toast.msg}</div>
        )}

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>

          {/* Avatar picker */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.6rem" }}>
              Choose your avatar
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.5rem" }}>
              {AVATARS.map(src => (
                <button
                  key={src}
                  onClick={() => setAvatarUrl(src)}
                  style={{
                    padding: 0, background: "none", border: "2.5px solid",
                    borderColor: avatarUrl === src ? "var(--teal)" : "transparent",
                    borderRadius: "50%", cursor: "pointer",
                    boxShadow: avatarUrl === src ? "0 0 0 2px var(--teal)" : "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  aria-label={"Select avatar " + src}
                  aria-pressed={avatarUrl === src}
                >
                  <img src={src} alt="" style={{ width: "100%", aspectRatio: "1", borderRadius: "50%", display: "block" }} />
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", margin: "0 0 1.1rem" }} />

          {/* Name */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
              Display Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              style={inputStyle}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
              Email <span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.7rem" }}>(optional — for future notifications)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={inputStyle}
            />
          </div>

          {/* House number */}
          <div style={{ marginBottom: "1.1rem" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
              House Number <span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.7rem" }}>(optional)</span>
            </label>
            <input
              value={houseNo}
              onChange={e => setHouseNo(e.target.value)}
              placeholder="e.g. 14"
              style={inputStyle}
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", margin: "0 0 0.25rem" }} />

          {/* Toggles */}
          <Toggle
            value={hideName}
            onChange={setHideName}
            label="Hide My Name"
            description='Show as "Resident" in event attendee lists'
          />
          <div style={{ height: 1, background: "var(--border)" }} />
          <Toggle
            value={barOptIn}
            onChange={setBarOptIn}
            label="🍺 Community Bar Access"
            description="Enable the Community Bar tab"
          />

          {/* Change PIN link */}
          <div style={{ height: 1, background: "var(--border)", margin: "0.25rem 0 0.75rem" }} />
          <a
            href="/profile"
            onClick={onClose}
            style={{
              display: "block", textAlign: "center",
              fontSize: "0.82rem", color: "var(--text-dim)",
              textDecoration: "none", padding: "0.4rem",
            }}
          >
            🔒 Change PIN
          </a>
        </div>

        {/* Footer */}
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: "100%", padding: "0.85rem",
              background: "var(--teal)", color: "#fff",
              border: "none", borderRadius: "10px",
              fontSize: "1rem", fontWeight: 700, fontFamily: "inherit",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >{saving ? "Saving…" : "Save Profile"}</button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
