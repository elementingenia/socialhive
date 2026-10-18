"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { matchesResidentSearch } from "@/lib/welcomeCards"

// Admin › Sign-in Help (Iain, 2026-10-09). Residents who have never signed
// in, sorted by house number for walking round, with a printable welcome
// card each (username, one-time password, QR code to sign in). "Everyone"
// covers reprints for a resident who forgot their password. Printing resets
// that resident's password, so it asks first.
//
// 2026-10-19 (Iain): search by name or house number; the Print action sits in
// a bar fixed above the bottom nav so it's reachable without scrolling; the
// cards come back as one PDF (lib/welcomeCardsPdf.js), not a web page.

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

// Fixed tray above BottomNav (60px + safe area). The right gutter leaves room
// for the floating Find / Ask buttons, which sit over this corner.
const trayStyle = {
  position: "fixed", left: 0, right: 0, bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
  background: "var(--surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -4px 14px rgba(0,0,0,0.08)", zIndex: 80,
}
const trayInner = { maxWidth: 720, margin: "0 auto", padding: "0.65rem 84px 0.65rem 16px", display: "flex", flexDirection: "column", gap: "0.5rem" }

function pdfUrl(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
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
  const [search, setSearch] = useState("")
  const [printError, setPrintError] = useState(null)
  // Set when some residents got no card: the PDF waits in the tray so the
  // "No card for" message is seen before leaving the page (BUG-087).
  const [result, setResult] = useState(null)

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

  useEffect(() => { setSelected(new Set()); setConfirming(false); setResult(null); load() }, [load])

  function toggle(id) {
    setConfirming(false); setResult(null); setPrintError(null)
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

  function openPdf(url) {
    const q = new URLSearchParams({ url, name: "Welcome cards.pdf", back: "/admin?tab=Residents&sub=SignInHelp" })
    router.push(`/documents/view?${q.toString()}`)
  }

  async function print() {
    setBusy(true); setPrintError(null); setMsg(null); setResult(null)
    try {
      const r = await authedFetch("/api/admin/welcome-cards", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "print", member_ids: [...selected] }) })
      const d = await r.json()
      if (!r.ok) {
        setConfirming(false); setSelected(new Set()); load()
        throw new Error(d.error || "Could not print cards.")
      }
      setConfirming(false); setSelected(new Set())
      const url = d.pdf ? pdfUrl(d.pdf) : null
      if (url && !d.failed?.length) { openPdf(url); return }
      setResult({ url, count: d.count || 0, failed: d.failed || [] })
      load()
    } catch (e) { setPrintError(e.message) }
    setBusy(false)
  }

  const all = residents || []
  const list = all.filter(m => matchesResidentSearch(m, search))
  // Selection survives searching: tick #12, search for #40, tick them too.
  const chosen = all.filter(m => selected.has(m.id))
  const chosenSignedIn = chosen.filter(m => m.signedIn).length
  const allOn = list.length > 0 && list.every(m => selected.has(m.id))
  const trayOpen = chosen.length > 0 || confirming || !!result || !!printError

  function toggleVisible() {
    setConfirming(false); setResult(null); setPrintError(null)
    setSelected(s => {
      const n = new Set(s)
      list.forEach(m => allOn ? n.delete(m.id) : n.add(m.id))
      return n
    })
  }
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
            <Btn onClick={toggleVisible}>
              {allOn ? (search.trim() ? "Untick these" : "Clear") : (search.trim() ? `Select these ${list.length}` : "Select all")}
            </Btn>
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} enterKeyHint="search"
          placeholder="Find by name or house number" aria-label="Find a resident by name or house number"
          style={{ ...inputStyle, paddingRight: search ? "2.4rem" : undefined }} />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search" style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 30, height: 30,
            border: "none", background: "transparent", color: "var(--text-dim)", fontSize: "1.1rem", cursor: "pointer", fontFamily: "inherit",
          }}>✕</button>
        )}
      </div>

      {error && <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>}
      {msg && <div style={{ color: "var(--teal)", fontSize: "0.85rem" }}>{msg}</div>}

      {loading ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Loading residents…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: "0.9rem", color: "var(--text-dim)" }}>
          {all.length > 0 && search.trim()
            ? `No ${scope === "never" ? "never-signed-in " : ""}resident matches “${search.trim()}”.${scope === "never" ? " Try Everyone." : ""}`
            : scope === "never" ? "Everyone has signed in at least once." : "No residents found."}
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

      {trayOpen && <div aria-hidden style={{ height: confirming ? 170 : 110 }} />}

      {trayOpen && (
        <div style={trayStyle}>
          <div style={trayInner}>
            {printError && <div style={{ color: "#e53e3e", fontSize: "0.85rem", fontWeight: 600 }}>{printError}</div>}

            {result && (
              <>
                {result.failed.length > 0 && (
                  <div style={{ color: "#e53e3e", fontSize: "0.85rem", fontWeight: 600 }}>
                    No card for: {result.failed.join(", ")}. Their password was not changed. Print again for {result.failed.length === 1 ? "them" : "these residents"}.
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {result.url && <Btn tone="primary" onClick={() => openPdf(result.url)}>Open {result.count} card{result.count === 1 ? "" : "s"} (PDF)</Btn>}
                  <Btn onClick={() => setResult(null)}>Close</Btn>
                </div>
              </>
            )}

            {!result && chosen.length > 0 && !confirming && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", flexShrink: 0 }}>{chosen.length} ticked</div>
                <Btn onClick={() => { setSelected(new Set()); setPrintError(null) }}>Clear</Btn>
                <div style={{ flex: 1 }}>
                  <Btn tone="primary" full onClick={() => { setPrintError(null); setConfirming(true) }}>
                    Print {chosen.length} card{chosen.length === 1 ? "" : "s"}
                  </Btn>
                </div>
              </div>
            )}

            {!result && confirming && chosen.length > 0 && (
              <>
                <div style={{ fontSize: "0.88rem" }}>
                  Printing gives {chosen.length === 1 ? "this resident" : `these ${chosen.length} residents`} a new starting password.
                  {chosenSignedIn > 0 && <> <strong>{chosenSignedIn} already {chosenSignedIn === 1 ? "signs" : "sign"} in</strong>: their current password will stop working.</>}
                  {" "}The cards open as one PDF: print on A4, cut along the dashed lines, and hand each card to the resident or put it in their letterbox.
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Btn tone="primary" onClick={print} disabled={busy}>{busy ? "Printing…" : "Yes, print"}</Btn>
                  <Btn onClick={() => setConfirming(false)} disabled={busy}>Cancel</Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
