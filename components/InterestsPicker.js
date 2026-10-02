"use client"
import { useState, useEffect } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { MAX_INTERESTS, LABEL_MAX, validateLabel, sortByLabel } from "@/lib/interests"

// Profile "Ask me about" section (backlog B3). Tap chips to choose, saved
// with the rest of the profile (parent's Save calls PUT /api/interests with
// `value`). "Suggest another" is sent straight away (POST) because it creates
// something for an admin to review; it shows here as "Awaiting approval"
// until then, and only to the resident(s) who chose it (Q1).
//
// Locked while "Hide my name" is on (D2): picks are kept, nothing editable,
// and they're hidden from everyone until Private is turned off.
//
// Props: value (selected tag ids), onChange(ids), onLoaded(ids) -- initial
// selection from the server, locked (live Hide-my-name toggle state).
export default function InterestsPicker({ value, onChange, onLoaded, locked }) {
  const [tags, setTags] = useState([])        // approved chips
  const [pending, setPending] = useState([])  // my pending suggestions
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let alive = true
    authedFetch("/api/interests").then(async res => {
      if (!alive) return
      if (!res.ok) { setLoadError(true); setLoading(false); return }
      const d = await res.json()
      setTags(d.tags || [])
      setPending((d.mine || []).filter(t => t.status === "pending"))
      onLoaded?.((d.mine || []).map(t => t.id))
      setLoading(false)
    }).catch(() => { if (alive) { setLoadError(true); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const selected = new Set(value || [])
  const atCap = selected.size >= MAX_INTERESTS

  function toggle(id) {
    if (locked) return
    setMsg(null)
    if (selected.has(id)) onChange((value || []).filter(x => x !== id))
    else if (!atCap) onChange([...(value || []), id])
    else setMsg({ ok: false, text: `You can choose up to ${MAX_INTERESTS}. Untick one first.` })
  }

  async function suggest() {
    const err = validateLabel(text)
    if (err) { setMsg({ ok: false, text: err }); return }
    setBusy(true); setMsg(null)
    const res = await authedFetch("/api/interests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: text }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Couldn't send that -- try again." }); return }
    const tag = d.tag
    if (tag.status === "pending") setPending(p => sortByLabel(p.some(x => x.id === tag.id) ? p : [...p, tag]))
    if (!selected.has(tag.id)) onChange([...(value || []), tag.id])
    setText("")
    setMsg({ ok: true, text:
      d.outcome === "selected" || d.outcome === "already" ? `"${tag.label}" is already on the list -- it's now ticked.`
      : d.outcome === "joined" ? `Someone has already suggested "${tag.label}" -- you've been added to it.`
      : `Thanks -- "${tag.label}" has been sent to the admins for approval.` })
  }

  const chips = [...tags, ...pending]

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem", paddingTop: "0.85rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)" }}>Ask me about <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0.2rem 0 0.55rem", lineHeight: 1.4 }}>
        {locked
          ? "Locked while 'Hide my name' is on. Anything you've chosen is kept and comes back if you turn it off."
          : `Tick things you're happy for neighbours to ask you about. They show on your card in Contacts. Up to ${MAX_INTERESTS}.`}
      </div>

      {loading ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ fontSize: "0.8rem", color: "#e53e3e" }}>Couldn't load interests. Close and reopen your profile to try again.</div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", opacity: locked ? 0.55 : 1 }}>
            {chips.map(t => {
              const on = selected.has(t.id)
              const isPending = t.status === "pending"
              return (
                <button key={t.id} type="button" onClick={() => toggle(t.id)} disabled={locked}
                  aria-pressed={on}
                  style={{
                    minHeight: 36, padding: "0.35rem 0.75rem", borderRadius: 999, fontFamily: "inherit",
                    fontSize: "0.82rem", fontWeight: on ? 700 : 500, cursor: locked ? "not-allowed" : "pointer",
                    border: `1.5px ${isPending ? "dashed" : "solid"} ${on ? "var(--teal)" : "var(--border)"}`,
                    background: on ? "var(--teal)" : "var(--surface)", color: on ? "#fff" : "var(--text)",
                  }}>
                  {on ? "✓ " : ""}{t.label}{isPending ? " · awaiting approval" : ""}
                </button>
              )
            })}
          </div>

          {!locked && (
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.65rem" }}>
              <input value={text} onChange={e => setText(e.target.value)} maxLength={LABEL_MAX}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); suggest() } }}
                placeholder="Not listed? Suggest another"
                style={{ flex: 1, minWidth: 0, padding: "0.55rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit" }} />
              <button type="button" onClick={suggest} disabled={busy || !text.trim()}
                style={{ flexShrink: 0, padding: "0 0.9rem", borderRadius: 10, border: "none", background: "var(--teal)", color: "#fff", fontWeight: 700, fontSize: "0.85rem", fontFamily: "inherit", cursor: busy || !text.trim() ? "not-allowed" : "pointer", opacity: busy || !text.trim() ? 0.6 : 1 }}>
                {busy ? "…" : "Suggest"}
              </button>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: "0.45rem", fontSize: "0.78rem", color: msg.ok ? "var(--teal)" : "#e53e3e", lineHeight: 1.4 }}>{msg.text}</div>
          )}
        </>
      )}
    </div>
  )
}
