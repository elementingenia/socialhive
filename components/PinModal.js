"use client"
import { useState } from "react"
import { supabase } from "@/lib/supabase"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "1rem", boxSizing: "border-box",
  fontFamily: "inherit", textAlign: "center", letterSpacing: "0.25em",
}

export default function PinModal({ open, onClose }) {
  const [curPin,   setCurPin]   = useState("")
  const [newPin,   setNewPin]   = useState("")
  const [cfmPin,   setCfmPin]   = useState("")
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  function reset() {
    setCurPin(""); setNewPin(""); setCfmPin("")
    setError(null); setSuccess(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSave() {
    setError(null)
    if (!curPin || !newPin || !cfmPin) { setError("All fields are required"); return }
    if (newPin !== cfmPin)             { setError("New PINs don't match"); return }
    if (!/^\d{4,8}$/.test(newPin))    { setError("PIN must be 4–8 digits"); return }

    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ current_pin: curPin, new_pin: newPin }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setSuccess(true)
      setTimeout(() => { handleClose() }, 1800)
    } else {
      setError(body.error || "PIN change failed — check your current PIN")
    }
  }

  if (!open) return null

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", zIndex: 400 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(360px, calc(100vw - 2rem))",
        background: "var(--surface)", borderRadius: "16px",
        padding: "1.75rem 1.5rem", zIndex: 401,
        boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>Change PIN</div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.3rem", color: "var(--text-dim)", lineHeight: 1 }} aria-label="Close">✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✓</div>
            <div style={{ fontWeight: 700, color: "var(--teal)", fontSize: "1rem" }}>PIN updated successfully</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Current PIN</label>
              <input value={curPin} onChange={e => setCurPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} type="password" inputMode="numeric" placeholder="••••" maxLength={8} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>New PIN</label>
              <input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} type="password" inputMode="numeric" placeholder="4–8 digits" maxLength={8} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>Confirm new PIN</label>
              <input value={cfmPin} onChange={e => setCfmPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} type="password" inputMode="numeric" placeholder="4–8 digits" maxLength={8} />
            </div>

            {error && (
              <div style={{ padding: "0.6rem 0.9rem", borderRadius: "8px", background: "#fee2e2", color: "#b91c1c", fontSize: "0.85rem" }}>{error}</div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{ marginTop: "0.25rem", padding: "0.85rem", borderRadius: "10px", background: "var(--teal)", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "1rem", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Updating…" : "Update PIN"}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
