"use client"
import { useState, useEffect } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { KIND, MAX_INTERESTS, MAX_SKILLS, LABEL_MAX, NOTE_MAX, validateLabel, sortByLabel } from "@/lib/interests"

// One Profile chip section, for either list (same engine, backlog B7):
//   kind="interest" -> "Ask me about"   (B3)
//   kind="skill"    -> "I can help with" (B7), plus an optional short note
//                      per ticked skill (S2) and the S4 disclaimer.
// Tap chips to choose; saved with the rest of the profile (the parent's Save
// sends BOTH lists in one PUT /api/interests -- that PUT replaces all of a
// resident's picks, so the parent must never send one list without the
// other). "Suggest another" is sent straight away (POST) because it creates
// something for an admin to review; it shows here in amber as "awaiting
// approval" until then.
//
// Locked while "Hide my name" is on (D2/S8): picks are kept, nothing
// editable, and they're hidden from everyone until Private is turned off.
//
// Props: kind, value (selected tag ids), onChange(ids), onLoaded(ids, notes)
// -- initial selection from the server, locked, notes ({ tag_id: note },
// skills only), onNotesChange(notes).
export const SKILLS_DISCLAIMER = "Neighbours offering a hand. Not checked or endorsed by the committee or Ingenia. Arrange things directly with each other."

const COPY = {
  interest: {
    title: "Ask me about",
    help: max => `Tick things you're happy for neighbours to ask you about. They show on your card in Contacts. Up to ${max}.`,
    placeholder: "Not listed? Suggest another",
  },
  skill: {
    title: "I can help with",
    help: max => `Tick anything you're happy to help neighbours with. Add a short note if you like. Up to ${max}.`,
    placeholder: "Not listed? Suggest a skill",
  },
}

export default function InterestsPicker({ kind = KIND.INTEREST, value, onChange, onLoaded, locked, notes = {}, onNotesChange }) {
  const isSkill = kind === KIND.SKILL
  const max = isSkill ? MAX_SKILLS : MAX_INTERESTS
  const copy = COPY[isSkill ? "skill" : "interest"]
  const [tags, setTags] = useState([])        // approved chips of this kind
  const [pending, setPending] = useState([])  // my pending suggestions of this kind
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
      const mine = (d.mine || []).filter(t => (t.kind || KIND.INTEREST) === kind)
      setTags((d.tags || []).filter(t => (t.kind || KIND.INTEREST) === kind))
      setPending(mine.filter(t => t.status === "pending"))
      onLoaded?.(mine.map(t => t.id), Object.fromEntries(mine.filter(t => t.note).map(t => [t.id, t.note])))
      setLoading(false)
    }).catch(() => { if (alive) { setLoadError(true); setLoading(false) } })
    return () => { alive = false }
  }, [kind])

  const selected = new Set(value || [])
  const atCap = selected.size >= max
  const chips = [...tags, ...pending]
  const labelOf = Object.fromEntries(chips.map(t => [t.id, t.label]))

  function toggle(id) {
    if (locked) return
    setMsg(null)
    if (selected.has(id)) onChange((value || []).filter(x => x !== id))
    else if (!atCap) onChange([...(value || []), id])
    else setMsg({ ok: false, text: `You can choose up to ${max}. Untick one first.` })
  }

  async function suggest() {
    const err = validateLabel(text)
    if (err) { setMsg({ ok: false, text: err }); return }
    setBusy(true); setMsg(null)
    const res = await authedFetch("/api/interests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: text, kind }),
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

  const ticked = (value || []).filter(id => labelOf[id]).sort((a, b) => labelOf[a].localeCompare(labelOf[b]))

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem", paddingTop: "0.85rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)" }}>{copy.title} <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(optional)</span></div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", margin: "0.2rem 0 0.55rem", lineHeight: 1.4 }}>
        {locked
          ? "Locked while 'Hide my name' is on. Anything you've chosen is kept and comes back if you turn it off."
          : copy.help(max)}
        {isSkill && !locked && <><br />{SKILLS_DISCLAIMER}</>}
      </div>

      {loading ? (
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ fontSize: "0.8rem", color: "#e53e3e" }}>Couldn't load this list. Close and reopen your profile to try again.</div>
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
                    // Pending suggestions are amber, not teal (Iain, 2026-10-03:
                    // "needs differentiating beyond the text") -- amber is the
                    // app's existing "waiting on someone" colour. Dashed border
                    // kept as a second cue. Text #78350f on --amber-light is
                    // ~7:1 contrast and fixed, so it holds in dark mode too.
                    border: `1.5px ${isPending ? "dashed" : "solid"} ${isPending ? "var(--amber-dark)" : on ? "var(--teal)" : "var(--border)"}`,
                    background: isPending ? (on ? "var(--amber-light)" : "var(--surface)") : on ? "var(--teal)" : "var(--surface)",
                    color: isPending ? (on ? "#78350f" : "var(--text)") : on ? "#fff" : "var(--text)",
                  }}>
                  {on ? "✓ " : ""}{t.label}{isPending ? " · awaiting approval" : ""}
                </button>
              )
            })}
          </div>

          {/* S2: optional note per ticked skill. Only ticked skills get a box,
              so nothing extra shows until something is chosen. */}
          {isSkill && !locked && ticked.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.7rem" }}>
              {ticked.map(id => (
                <div key={id}>
                  <label htmlFor={`skill-note-${id}`} style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.2rem" }}>
                    {labelOf[id]} <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>— note (optional)</span>
                  </label>
                  <input id={`skill-note-${id}`} value={notes[id] || ""} maxLength={NOTE_MAX}
                    onChange={e => onNotesChange?.({ ...notes, [id]: e.target.value })}
                    placeholder="e.g. Small jobs only, happy to visit"
                    style={{ width: "100%", padding: "0.5rem 0.8rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.9rem", boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>
          )}

          {!locked && (
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.65rem" }}>
              <input value={text} onChange={e => setText(e.target.value)} maxLength={LABEL_MAX}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); suggest() } }}
                placeholder={copy.placeholder}
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
