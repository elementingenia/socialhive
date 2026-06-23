"use client"
import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// F1–F6 are women, M7–M12 are men
const FEMALE_AVATARS = Array.from({ length: 6 }, (_, i) => `/avatars/avatar_${String(i + 1).padStart(2, "0")}.svg`)
const MALE_AVATARS   = Array.from({ length: 6 }, (_, i) => `/avatars/avatar_${String(i + 7).padStart(2, "0")}.svg`)

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
          flexShrink: 0, width: 48, height: 28, borderRadius: 14,
          background: value ? "var(--teal)" : "var(--border)",
          border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
        }}
        aria-checked={value} role="switch" aria-label={label}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 22, height: 22, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
        }} />
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
          <button
            key={src}
            onClick={() => onSelect(src)}
            style={{
              padding: 3, borderRadius: 10, border: selected === src ? "2.5px solid var(--teal)" : "2.5px solid transparent",
              background: selected === src ? "var(--teal-light, rgba(0,128,128,0.1))" : "transparent",
              cursor: "pointer", lineHeight: 0,
            }}
            aria-label={src}
          >
            <img src={src} alt="" style={{ width: "100%", borderRadius: 7, display: "block" }} />
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ProfileSlideOver({ open, onClose }) {
  const { member, refreshUser } = useUser()

  // Pre-populate immediately from UserContext data (name, avatar, bar_opt_in known already)
  const [name,       setName]      = useState("")
  const [email,      setEmail]     = useState("")
  const [house,      setHouse]     = useState("")
  const [hideName,   setHideName]  = useState(false)
  const [barOptIn,   setBarOptIn]  = useState(false)
  const [avatar,     setAvatar]    = useState(null)
  const [loading,    setLoading]   = useState(false)
  const [saving,     setSaving]    = useState(false)
  const [toast,      setToast]     = useState(null)

  // PIN change state
  const [pinOpen,    setPinOpen]   = useState(false)
  const [curPin,     setCurPin]    = useState("")
  const [newPin,     setNewPin]    = useState("")
  const [cfmPin,     setCfmPin]    = useState("")
  const [pinSaving,  setPinSaving] = useState(false)
  const [pinToast,   setPinToast]  = useState(null)

  // Seed from UserContext the moment we have member data (fast path — no API round trip)
  useEffect(() => {
    if (member) {
      setName(member.name || "")
      setBarOptIn(!!member.bar_opt_in)
      setAvatar(member.avatar_url || null)
    }
  }, [member])

  // When slide-over opens, fetch full profile (email, house_number, hide_name)
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
      showToast("Profile saved")
      refreshUser?.()
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || "Save failed — try again", false)
    }
  }

  const handlePinSave = async () => {
    if (!curPin || !newPin || !cfmPin) { setPinToast({ msg: "All PIN fields required", ok: false }); return }
    if (newPin !== cfmPin)             { setPinToast({ msg: "New PINs don't match", ok: false }); return }
    if (!/^\d{4,8}$/.test(newPin))    { setPinToast({ msg: "PIN must be 4–8 digits", ok: false }); return }
    setPinSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ current_pin: curPin, new_pin: newPin }),
    })
    setPinSaving(false)
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setPinToast({ msg: "PIN updated", ok: true })
      setCurPin(""); setNewPin(""); setCfmPin("")
      setTimeout(() => { setPinToast(null); setPinOpen(false) }, 2000)
    } else {
      setPinToast({ msg: body.error || "PIN change failed", ok: false })
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 200 }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)",
        background: "var(--surface)", zIndex: 201, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>My Profile</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "var(--text-dim)", lineHeight: 1 }} aria-label="Close">✕</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-dim)" }}>Loading…</div>
          ) : (
            <>
              {/* Avatar picker */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.75rem" }}>Choose your avatar</div>
                <AvatarRow label="Women" avatars={FEMALE_AVATARS} selected={avatar} onSelect={setAvatar} />
                <AvatarRow label="Men"   avatars={MALE_AVATARS}   selected={avatar} onSelect={setAvatar} />
                {avatar && (
                  <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
                    <img src={avatar} alt="Selected avatar" style={{ width: 56, height: 56, borderRadius: 10, border: "2px solid var(--teal)" }} />
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Display name */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Display name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Email <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" type="email" />
                </div>

                {/* House number */}
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>House number <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></label>
                  <input value={house} onChange={e => setHouse(e.target.value)} style={inputStyle} placeholder="e.g. 14" />
                </div>
              </div>

              {/* Toggles */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "0.75rem" }}>
                <Toggle
                  value={hideName}
                  onChange={setHideName}
                  label="Hide my name"
                  description="Show me as 'Resident' in event attendee lists"
                />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <Toggle
                  value={barOptIn}
                  onChange={setBarOptIn}
                  label="Bar access"
                  description="Enable the Community Bar tab for your account"
                />
              </div>

              {/* PIN change — collapsible */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem" }}>
                <button
                  onClick={() => setPinOpen(v => !v)}
                  style={{ width: "100%", padding: "0.9rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)", fontSize: "0.92rem", fontWeight: 600, fontFamily: "inherit" }}
                >
                  <span>Change PIN</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{pinOpen ? "▲" : "▼"}</span>
                </button>

                {pinOpen && (
                  <div style={{ paddingBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Current PIN</label>
                      <input value={curPin} onChange={e => setCurPin(e.target.value)} style={inputStyle} type="password" inputMode="numeric" placeholder="••••" maxLength={8} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>New PIN</label>
                      <input value={newPin} onChange={e => setNewPin(e.target.value)} style={inputStyle} type="password" inputMode="numeric" placeholder="4–8 digits" maxLength={8} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Confirm new PIN</label>
                      <input value={cfmPin} onChange={e => setCfmPin(e.target.value)} style={inputStyle} type="password" inputMode="numeric" placeholder="4–8 digits" maxLength={8} />
                    </div>
                    {pinToast && (
                      <div style={{ padding: "0.6rem 0.9rem", borderRadius: 8, background: pinToast.ok ? "var(--teal)" : "#e53e3e", color: "#fff", fontSize: "0.85rem" }}>{pinToast.msg}</div>
                    )}
                    <button
                      onClick={handlePinSave}
                      disabled={pinSaving}
                      style={{ padding: "0.75rem", borderRadius: 10, background: "var(--teal)", color: "#fff", border: "none", cursor: pinSaving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.95rem", fontFamily: "inherit", opacity: pinSaving ? 0.7 : 1 }}
                    >
                      {pinSaving ? "Updating…" : "Update PIN"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
          {toast && (
            <div style={{ marginBottom: "0.75rem", padding: "0.6rem 0.9rem", borderRadius: 8, background: toast.ok ? "var(--teal)" : "#e53e3e", color: "#fff", fontSize: "0.85rem" }}>{toast.msg}</div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: "100%", padding: "0.9rem", borderRadius: 10, background: "var(--teal)", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "1rem", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </>
  )
}
