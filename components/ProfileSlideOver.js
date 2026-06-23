"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

const FEMALE_AVATARS = Array.from({ length: 6 }, (_, i) => `/avatars/avatar_${String(i + 1).padStart(2, "0")}.svg`)
const MALE_AVATARS   = Array.from({ length: 6 }, (_, i) => `/avatars/avatar_${String(i + 7).padStart(2, "0")}.svg`)

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.75rem 0" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{label}</div>
        {description && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{ flexShrink: 0, width: 48, height: 28, borderRadius: 14, background: value ? "var(--teal)" : "var(--border)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }} aria-checked={value} role="switch" aria-label={label}>
        <span style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
      </button>
    </div>
  )
}

function AvatarRow({ label, avatars, selected, onSelect }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.5rem" }}>
        {avatars.map(src => (
          <button key={src} onClick={() => onSelect(src)} style={{ padding: 3, borderRadius: 10, border: selected === src ? "2.5px solid var(--teal)" : "2.5px solid transparent", background: selected === src ? "rgba(0,128,128,0.1)" : "transparent", cursor: "pointer", lineHeight: 0 }} aria-label={src}>
            <img src={src} alt="" style={{ width: "100%", borderRadius: 7, display: "block" }} />
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ProfileSlideOver({ open, onClose, onSaved }) {
  const { member, refreshUser } = useUser()

  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [house,    setHouse]    = useState("")
  const [hideName, setHideName] = useState(false)
  const [barOptIn, setBarOptIn] = useState(false)
  const [avatar,   setAvatar]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState(null)

  // Seed fast from UserContext immediately
  useEffect(() => {
    if (member) {
      setName(member.name || "")
      setBarOptIn(!!member.bar_opt_in)
      setAvatar(member.avatar_url || null)
    }
  }, [member])

  // Full fetch on open (email, house_number, hide_name)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoading(false); return }
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setName(d.name || "")
        setEmail(d.email || "")
        setHouse(d.house_number || "")
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
      body: JSON.stringify({ name: name.trim(), email: email.trim(), house_number: house.trim(), hide_name: hideName, bar_opt_in: barOptIn, avatar_url: avatar }),
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

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 200 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", background: "var(--surface)", zIndex: 201, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.25)" }}>

        <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>My Profile</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "var(--text-dim)", lineHeight: 1 }} aria-label="Close">✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-dim)" }}>Loading…</div>
          ) : (
            <>
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.75rem" }}>Choose your avatar</div>
                <AvatarRow label="Women" avatars={FEMALE_AVATARS} selected={avatar} onSelect={setAvatar} />
                <AvatarRow label="Men"   avatars={MALE_AVATARS}   selected={avatar} onSelect={setAvatar} />
                {avatar && (
                  <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
                    <img src={avatar} alt="Selected" style={{ width: 56, height: 56, borderRadius: 10, border: "2px solid var(--teal)" }} />
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Display name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Email <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" type="email" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>House number <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={house} onChange={e => setHouse(e.target.value)} style={inputStyle} placeholder="e.g. 14" />
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "0.75rem" }}>
                <Toggle value={hideName} onChange={setHideName} label="Hide my name" description="Show me as 'Resident' in event attendee lists" />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Toggle value={barOptIn} onChange={setBarOptIn} label="Bar access" description="Enable the Community Bar tab for your account" />
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
          {toast && (
            <div style={{ marginBottom: "0.75rem", padding: "0.6rem 0.9rem", borderRadius: 8, background: toast.ok ? "var(--teal)" : "#e53e3e", color: "#fff", fontSize: "0.85rem" }}>{toast.msg}</div>
          )}
          <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "0.9rem", borderRadius: 10, background: "var(--teal)", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "1rem", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </>
  )
}
