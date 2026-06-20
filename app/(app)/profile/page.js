"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const FIELD = (label, children) => (
  <div style={{ marginBottom: "1.5rem" }}>
    <div style={{
      fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em",
      color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "0.4rem",
    }}>{label}</div>
    {children}
  </div>
)

const INPUT = (props) => (
  <input {...props} style={{
    width: "100%", padding: "0.7rem 0.85rem",
    border: "1.5px solid var(--border)", borderRadius: 10,
    fontSize: "1rem", fontFamily: "inherit", color: "var(--text)",
    background: "var(--surface)", outline: "none",
    ...props.style,
  }} />
)

function InitialsAvatar({ name }) {
  const initials = (name || "?")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div style={{
      width: 72, height: 72, borderRadius: "50%",
      background: "var(--amber)", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "1.6rem", fontWeight: 700, flexShrink: 0,
    }}>{initials}</div>
  )
}

export default function ProfilePage() {
  const [profile, setProfile]     = useState(null)
  const [name, setName]           = useState("")
  const [houseNo, setHouseNo]     = useState("")
  const [barOptIn, setBarOptIn]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)

  // PIN change state
  const [showPin, setShowPin]     = useState(false)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin]       = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [pinSaving, setPinSaving] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch("/api/profile", {
      headers: { Authorization: "Bearer " + session.access_token }
    })
    const data = await res.json()
    setProfile(data)
    setName(data.name || "")
    setHouseNo(data.house_number || "")
    setBarOptIn(data.bar_opt_in || false)
  }

  async function saveProfile() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ name, house_number: houseNo || null, bar_opt_in: barOptIn }),
    })
    setSaving(false)
    if (res.ok) {
      showToast("Profile saved", "var(--teal)")
    } else {
      showToast("Save failed — try again", "var(--danger)")
    }
  }

  async function changePin() {
    if (newPin.length < 4) return showToast("PIN must be at least 4 digits", "var(--danger)")
    if (newPin !== confirmPin) return showToast("PINs don't match", "var(--danger)")
    setPinSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ currentPin, newPin }),
    })
    setPinSaving(false)
    if (res.ok) {
      setCurrentPin(""); setNewPin(""); setConfirmPin("")
      setShowPin(false)
      showToast("PIN updated", "var(--teal)")
    } else {
      const err = await res.json()
      showToast(err.error || "PIN change failed", "var(--danger)")
    }
  }

  function showToast(msg, colour) {
    setToast({ msg, colour })
    setTimeout(() => setToast(null), 3000)
  }

  if (!profile) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
      <div className="spinner" />
    </div>
  )

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "1.5rem 1rem 2rem" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          background: toast.colour, color: "#fff",
          padding: "0.65rem 1.2rem", borderRadius: 10,
          fontSize: "0.88rem", fontWeight: 600, zIndex: 200,
          boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
          whiteSpace: "nowrap",
        }}>{toast.msg}</div>
      )}

      {/* Avatar + username */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1rem",
        marginBottom: "2rem",
        padding: "1.25rem",
        background: "var(--surface)", borderRadius: 14,
        boxShadow: "var(--shadow)",
      }}>
        <InitialsAvatar name={name || profile.username} />
        <div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text)" }}>
            {name || profile.username}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
            @{profile.username}
          </div>
          <div style={{
            fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.35rem",
            fontStyle: "italic",
          }}>Profile image coming soon</div>
        </div>
      </div>

      {/* Editable fields */}
      <div style={{
        background: "var(--surface)", borderRadius: 14,
        padding: "1.25rem", boxShadow: "var(--shadow)", marginBottom: "1rem",
      }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1.25rem", color: "var(--text)" }}>
          My Details
        </h2>

        {FIELD("Username", (
          <div style={{
            padding: "0.7rem 0.85rem", borderRadius: 10,
            background: "var(--surface2)", color: "var(--text-dim)",
            fontSize: "1rem", border: "1.5px solid var(--border)",
          }}>{profile.username}</div>
        ))}

        {FIELD("Name", (
          <INPUT
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
          />
        ))}

        {FIELD("House Number (optional)", (
          <INPUT
            value={houseNo}
            onChange={e => setHouseNo(e.target.value)}
            placeholder="e.g. 14"
          />
        ))}

        <button
          onClick={saveProfile}
          disabled={saving}
          style={{
            width: "100%", padding: "0.8rem",
            background: "var(--amber)", color: "#fff",
            border: "none", borderRadius: 10,
            fontSize: "1rem", fontWeight: 700, fontFamily: "inherit",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1, marginTop: "0.5rem",
          }}
        >{saving ? "Saving…" : "Save Changes"}</button>
      </div>

      {/* Community Bar opt-in */}
      <div style={{
        background: "var(--surface)", borderRadius: 14,
        padding: "1.25rem", boxShadow: "var(--shadow)", marginBottom: "1rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
              🍺 Community Bar
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
              Enable access to the Community Bar tab feature
            </div>
          </div>
          <button
            onClick={async () => {
              const next = !barOptIn
              setBarOptIn(next)
              const { data: { session } } = await supabase.auth.getSession()
              await fetch("/api/profile", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + session.access_token,
                },
                body: JSON.stringify({ bar_opt_in: next }),
              })
              showToast(next ? "Community Bar enabled" : "Community Bar disabled", "var(--teal)")
            }}
            style={{
              width: 52, height: 30, borderRadius: 15, flexShrink: 0,
              background: barOptIn ? "var(--amber)" : "var(--border)",
              border: "none", cursor: "pointer", position: "relative",
              transition: "background 0.2s",
            }}
            aria-label={barOptIn ? "Disable Community Bar" : "Enable Community Bar"}
          >
            <span style={{
              position: "absolute", top: 3,
              left: barOptIn ? 24 : 3,
              width: 24, height: 24, borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </div>

      {/* Change PIN */}
      <div style={{
        background: "var(--surface)", borderRadius: 14,
        padding: "1.25rem", boxShadow: "var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
            🔒 Change PIN
          </div>
          <button
            onClick={() => setShowPin(v => !v)}
            style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: 8, padding: "0.3rem 0.7rem",
              fontSize: "0.82rem", color: "var(--text-dim)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >{showPin ? "Cancel" : "Change"}</button>
        </div>

        {showPin && (
          <div style={{ marginTop: "1.25rem" }}>
            {FIELD("Current PIN", (
              <INPUT
                type="password" inputMode="numeric" maxLength={8}
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value)}
                placeholder="Current PIN"
              />
            ))}
            {FIELD("New PIN", (
              <INPUT
                type="password" inputMode="numeric" maxLength={8}
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="New PIN (min 4 digits)"
              />
            ))}
            {FIELD("Confirm New PIN", (
              <INPUT
                type="password" inputMode="numeric" maxLength={8}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="Repeat new PIN"
              />
            ))}
            <button
              onClick={changePin}
              disabled={pinSaving || !currentPin || !newPin || !confirmPin}
              style={{
                width: "100%", padding: "0.8rem",
                background: "var(--amber)", color: "#fff",
                border: "none", borderRadius: 10,
                fontSize: "1rem", fontWeight: 700, fontFamily: "inherit",
                cursor: (pinSaving || !currentPin || !newPin || !confirmPin) ? "not-allowed" : "pointer",
                opacity: (pinSaving || !currentPin || !newPin || !confirmPin) ? 0.6 : 1,
              }}
            >{pinSaving ? "Updating…" : "Update PIN"}</button>
          </div>
        )}
      </div>
    </main>
  )
}
