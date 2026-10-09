"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { buildWelcomeCardsHtml } from "@/lib/welcomeCards"

// Admin › Sign-in Help (Iain, 2026-10-09). Residents who have never signed
// in, sorted by house number for walking round, with a printable welcome
// card each (username, one-time password, QR code to sign in). "Everyone"
// covers reprints for a resident who forgot their password. Printing resets
// that resident's password, so it asks first.

const inputStyle = {
  width: "100%", padding: "0.6rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}
const heading = { fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 0.5rem" }

function Btn({ children, onClick, tone = "plain", disabled, full }) {
  const tones = {
    primary: { background: "var(--teal)", color: "#fff", border: "1px solid var(--teal)" },
    plain:   { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" },
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...tones[tone], borderRadius: 8, padding: full ? "0.75rem 1rem" : "0.35rem 0.7rem",
      fontSize: full ? "0.95rem" : "0.78rem", fontWeight: 700, width: full ? "100%" : undefined,
      fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, minHeight: 34,
    }}>{children}</button>
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "0.35rem 0.8rem", borderRadius: 999, fontSize: "0.8rem", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
      border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
      background: active ? "var(--teal)" : "var(--surface)", color: active ? "#fff" : "var(--text)",
    }}>{children}</button>
  )
}

function Tick({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} style={{
      width: 26, height: 26, flexShrink: 0, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
      border: `2px solid ${on ? "var(--teal)" : "var(--border)"}`, background: on ? "var(--teal)" : "var(--surface)",
      color: "#fff", fontSize: "0.9rem", fontWeight: 800, lineHeight: 1, padding: 0,
    }}>{on ? "✓" : ""}</button>
  )
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" })

export default function WelcomeCardsAdmin() {
  const router = useRouter()
  const [scope, setScope] = useState("never")
  const [residents, setResidents] = useState(null)
  const [loading, setLoading] = useState(true)
  const [neverCount, setNeverCount] = useState(0)
  const [selected, setSelected] = useState(() => new Set())
  const [helpLine, setHelpLine] = useState("")
  const [helpDraft, setHelpDraft] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await authedFetch(`/api/admin/welcome-cards?scope=${scope}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not load residents.")
      setResidents(d.residents); setNeverCount(d.neverCount || 0)
      setHelpLine(d.helpLine || ""); setHelpDraft(d.helpLine || "")
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [scope])

  useEffect(() => { setSelected(new Set()); setConfirming(false); load() }, [load])

  function toggle(id) {
    setConfirming(false)
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function saveHelp() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_help", text: helpDraft }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not save.")
      setHelpLine(d.helpLine); setHelpDraft(d.helpLine); setMsg("Help line saved.")
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function print() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "print", member_ids: [...selected] }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not print cards.")
      setConfirming(false); setSelected(new Set())
      if (d.failed?.length) setError(`No card for: ${d.failed.join(", ")} (password not changed). Try again.`)
      if (d.cards?.length) {
        const html = buildWelcomeCardsHtml(d.cards, { site: d.site, helpLine: d.helpLine, failed: d.failed })
        const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
        const q = new URLSearchParams({ url, name: "Welcome cards.html", back: "/admin?tab=SignInHelp" })
        router.push(`/documents/view?${q.toString()}`)
        return
      }
      load()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const list = residents || []
  const chosen = list.filter(m => selected.has(m.id))
  const chosenSignedIn = chosen.filter(m => m.signedIn).length
  const allOn = list.length > 0 && list.every(m => selected.has(m.id))
  const helpDirty = helpDraft.trim() !== helpLine.trim()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>Sign-in Help</h2>
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>
          {neverCount} {neverCount === 1 ? "resident has" : "residents have"} never signed in. Print a welcome card for each
          with their username, a starting password and a code to scan. They choose their own password when they first sign in.
        </div>
      </div>

      <div>
        <div style={heading}>“Need help?” line on the card</div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input value={helpDraft} onChange={e => setHelpDraft(e.target.value)} maxLength={120}
            placeholder="e.g. Ask Iain, house 77, 0400 000 000" style={inputStyle} />
          <Btn tone="primary" onClick={saveHelp} disabled={busy || !helpDirty}>Save</Btn>
        </div>
        {!helpLine && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>Leave empty and the card has no help line.</div>}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <Pill active={scope === "never"} onClick={() => setScope("never")}>Never signed in ({neverCount})</Pill>
        <Pill active={scope === "all"} onClick={() => setScope("all")}>Everyone</Pill>
        {list.length > 0 && (
          <span style={{ marginLeft: "auto" }}>
            <Btn onClick={() => { setConfirming(false); setSelected(allOn ? new Set() : new Set(list.map(m => m.id))) }}>
              {allOn ? "Clear" : "Select all"}
            </Btn>
          </span>
        )}
      </div>

      {error && <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>}
      {msg && <div style={{ color: "var(--teal)", fontSize: "0.85rem" }}>{msg}</div>}

      {loading ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Loading residents…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: "0.9rem", color: "var(--text-dim)" }}>
          {scope === "never" ? "Everyone has signed in at least once." : "No residents found."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {list.map(m => (
            <div key={m.id} onClick={() => toggle(m.id)} style={{
              display: "flex", gap: "0.65rem", alignItems: "center", cursor: "pointer",
              background: "var(--surface)", border: `1px solid ${selected.has(m.id) ? "var(--teal)" : "var(--border)"}`,
              borderRadius: 12, padding: "0.55rem 0.75rem",
            }}>
              <Tick on={selected.has(m.id)} onClick={e => { e.stopPropagation(); toggle(m.id) }} label={`Select ${m.name}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                  {m.house_number ? `#${m.house_number} · ` : ""}{m.name}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span>{m.username}</span>
                  {m.printedAt && <span>Card printed {fmtDate(m.printedAt)}{m.printedBy ? ` by ${m.printedBy}` : ""}</span>}
                </div>
              </div>
              {m.signedIn
                ? <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--teal)", flexShrink: 0 }}>Signed in</span>
                : m.printedAt && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber)", flexShrink: 0 }}>Not yet</span>}
            </div>
          ))}
        </div>
      )}

      {chosen.length > 0 && !confirming && (
        <Btn tone="primary" full onClick={() => setConfirming(true)}>
          Print {chosen.length} card{chosen.length === 1 ? "" : "s"}
        </Btn>
      )}

      {confirming && chosen.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--amber)", borderRadius: 12, padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ fontSize: "0.9rem" }}>
            Printing gives {chosen.length === 1 ? "this resident" : `these ${chosen.length} residents`} a new starting password.
            {chosenSignedIn > 0 && <> <strong>{chosenSignedIn} already {chosenSignedIn === 1 ? "signs" : "sign"} in</strong>: their current password will stop working.</>}
            {" "}Hand each card to the resident or put it in their letterbox.
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Btn tone="primary" onClick={print} disabled={busy}>{busy ? "Printing…" : "Yes, print"}</Btn>
            <Btn onClick={() => setConfirming(false)} disabled={busy}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
