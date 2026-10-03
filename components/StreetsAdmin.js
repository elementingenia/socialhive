"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { STREET_NAME_MAX } from "@/lib/address"

// Admin > Streets (migration 122, Iain 2026-10-03). The set list residents
// pick their street from on their Profile -- they can't type their own.
// Add / Rename / Delete. Delete is refused while anyone is still on the
// street (rename it instead), so nobody's address silently disappears.

const inputStyle = {
  width: "100%", padding: "0.6rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.65rem 0.8rem" }
const heading = { fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 0.5rem" }

function Btn({ children, onClick, tone = "plain", disabled }) {
  const tones = {
    primary: { background: "var(--teal)", color: "#fff", border: "1px solid var(--teal)" },
    danger:  { background: "var(--surface)", color: "#e53e3e", border: "1px solid #e53e3e" },
    plain:   { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" },
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...tones[tone], borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.78rem", fontWeight: 700,
      fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, minHeight: 34,
    }}>{children}</button>
  )
}

const plural = n => `${n} ${n === 1 ? "person" : "people"}`

export default function StreetsAdmin() {
  const [streets, setStreets] = useState(null)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)   // { id, mode: "rename"|"delete" }
  const [field, setField] = useState("")
  const [newName, setNewName] = useState("")

  const load = useCallback(async () => {
    const res = await authedFetch("/api/streets")
    if (!res.ok) { setError("Couldn't load streets."); return }
    setStreets((await res.json()).streets || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function act(method, body, okText) {
    setBusy(true); setMsg(null)
    const res = await authedFetch("/api/streets", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error || "That didn't work -- try again." }); return false }
    setMsg({ ok: true, text: okText }); setOpen(null); setField("")
    await load()
    return true
  }

  function toggle(id, mode, initial = "") {
    setMsg(null)
    if (open?.id === id && open.mode === mode) { setOpen(null); return }
    setOpen({ id, mode }); setField(initial)
  }

  if (error) return <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>
  if (!streets) return <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Residents choose their street from this list on their Profile, next to their house number. Admins can set it from a resident&apos;s card in Info › Contacts. Renaming a street updates everyone on it.
      </div>

      {msg && <div style={{ fontSize: "0.82rem", color: msg.ok ? "var(--teal)" : "#e53e3e" }}>{msg.text}</div>}

      <section>
        <div style={heading}>Streets ({streets.length})</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={STREET_NAME_MAX}
            placeholder="Add a street, e.g. Mosaic Street" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          <Btn tone="primary" disabled={busy || !newName.trim()}
            onClick={async () => { if (await act("POST", { name: newName }, `"${newName.trim()}" added.`)) setNewName("") }}>Add</Btn>
        </div>
        {streets.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No streets yet. Residents won&apos;t see a Street option until you add one.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {streets.map(s => (
              <div key={s.id} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>{s.name}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}> · {plural(s.count || 0)}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <Btn disabled={busy} onClick={() => toggle(s.id, "rename", s.name)}>Rename</Btn>
                    <Btn tone="danger" disabled={busy} onClick={() => toggle(s.id, "delete")}>Delete</Btn>
                  </div>
                </div>
                {open?.id === s.id && open.mode === "rename" && (
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                    <input value={field} onChange={e => setField(e.target.value)} maxLength={STREET_NAME_MAX}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }} autoFocus />
                    <Btn tone="primary" disabled={busy || !field.trim()} onClick={() => act("PATCH", { id: s.id, name: field }, "Renamed.")}>Save</Btn>
                  </div>
                )}
                {open?.id === s.id && open.mode === "delete" && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text)" }}>
                    {s.count
                      ? <>{plural(s.count)} still {s.count === 1 ? "lives" : "live"} on {s.name}. Rename it instead, or move them to another street first.</>
                      : <>Delete &quot;{s.name}&quot;?</>}
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                      {!s.count && <Btn tone="danger" disabled={busy} onClick={() => act("DELETE", { id: s.id }, `"${s.name}" deleted.`)}>Yes, delete</Btn>}
                      <Btn disabled={busy} onClick={() => setOpen(null)}>{s.count ? "OK" : "Cancel"}</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
