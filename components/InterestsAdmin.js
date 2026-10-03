"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { LABEL_MAX } from "@/lib/interests"

// Admin > Interests & Skills (B3 + B7). An Interests / Skills switch at the
// top shows one list at a time (same engine, migration 124); each chip can
// be moved to the other list ("Make it a skill" / "Make it an interest").
// Admin > Interests (backlog B3). Review queue for resident suggestions
// (Approve / Merge into... / Reject) on top, then the approved chip list
// (Add / Rename / Retire), then retired chips (Restore). Admins only (Q4).
// Residents linked to a suggestion get an in-app notice of the outcome (Q3).

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

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}` }

export default function InterestsAdmin({ onCountChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)   // { id, mode: "merge"|"reject"|"rename"|"retire" }
  const [field, setField] = useState("")
  const [newLabel, setNewLabel] = useState("")
  const [showRetired, setShowRetired] = useState(false)
  const [kind, setKind] = useState("interest")   // which list is showing

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/interests")
    if (!res.ok) { setError("Couldn't load interests."); return }
    const d = await res.json()
    setData(d)
    onCountChange?.(d.pending.length)
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  async function act(method, body, okText) {
    setBusy(true); setMsg(null)
    const res = await authedFetch("/api/admin/interests", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error || "That didn't work -- try again." }); return false }
    setMsg({ ok: true, text: okText }); setOpen(null); setField("")
    await load()
    return true
  }

  function toggleOpen(id, mode, initial = "") {
    setMsg(null)
    if (open?.id === id && open.mode === mode) { setOpen(null); return }
    setOpen({ id, mode }); setField(initial)
  }

  if (error) return <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>
  if (!data) return <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>

  const isSkill = kind === "skill"
  const noun = isSkill ? "skill" : "interest"
  const other = isSkill ? "interest" : "skill"
  const ofKind = rows => rows.filter(t => (t.kind || "interest") === kind)
  const view = { pending: ofKind(data.pending), approved: ofKind(data.approved), retired: ofKind(data.retired) }
  const waiting = { interest: data.pending.filter(t => (t.kind || "interest") === "interest").length, skill: data.pending.filter(t => t.kind === "skill").length }
  // Merge only within the same list (the API refuses cross-kind merges).
  const mergeChoices = view.approved.filter(t => !field.trim() || t.label.toLowerCase().includes(field.trim().toLowerCase()))
  const switchTo = k => { setKind(k); setOpen(null); setField(""); setMsg(null) }
  const moveBtn = t => (
    <Btn disabled={busy} onClick={() => act("PATCH", { action: "set_kind", id: t.id, kind: other }, `"${t.label}" moved to ${other === "skill" ? "Skills" : "Interests"}.`)}>
      {other === "skill" ? "Make it a skill" : "Make it an interest"}
    </Btn>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {["interest", "skill"].map(k => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => switchTo(k)} style={{
            flex: 1, minHeight: 42, borderRadius: 10, fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
            border: "1.5px solid var(--teal)", background: kind === k ? "var(--teal)" : "var(--surface)", color: kind === k ? "#fff" : "var(--text)",
          }}>
            {k === "skill" ? "Skills" : "Interests"}{waiting[k] ? ` (${waiting[k]} waiting)` : ""}
          </button>
        ))}
      </div>

      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        {isSkill
          ? 'Residents choose these on their Profile under "I can help with", with an optional short note. They show on Info › Contacts (in a contact\'s expanded view) and under Search Skills in Info. Leave licensed trades (electrical, plumbing, gas) off this list.'
          : 'Residents choose these on their Profile under "Ask me about". They show on Info › Contacts (in a contact\'s expanded view) and under Search Interests in Info.'}
        {" "}Residents who turn on "Hide my name" are never shown.
      </div>

      {msg && <div style={{ fontSize: "0.82rem", color: msg.ok ? "var(--teal)" : "#e53e3e" }}>{msg.text}</div>}

      {/* Review queue */}
      <section>
        <div style={heading}>Waiting for review ({view.pending.length})</div>
        {view.pending.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Nothing to review.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {view.pending.map(t => (
              <div key={t.id} style={card}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>{t.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
                  {t.suggestedBy ? `Suggested by ${t.suggestedBy} · ` : ""}chosen by {plural(t.count, "resident", "residents")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                  <Btn tone="primary" disabled={busy} onClick={() => act("PATCH", { action: "approve", id: t.id }, `"${t.label}" approved.`)}>Approve</Btn>
                  <Btn disabled={busy} onClick={() => toggleOpen(t.id, "merge")}>Merge into…</Btn>
                  <Btn tone="danger" disabled={busy} onClick={() => toggleOpen(t.id, "reject")}>Reject</Btn>
                  {moveBtn(t)}
                </div>

                {open?.id === t.id && open.mode === "merge" && (
                  <div style={{ marginTop: "0.6rem" }}>
                    <input value={field} onChange={e => setField(e.target.value)} placeholder={`Find an existing ${noun}`} style={inputStyle} autoFocus />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem", maxHeight: 220, overflowY: "auto" }}>
                      {mergeChoices.length === 0
                        ? <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>No match.</div>
                        : mergeChoices.map(a => (
                          <Btn key={a.id} disabled={busy}
                            onClick={() => act("PATCH", { action: "merge", id: t.id, target_id: a.id }, `"${t.label}" merged into "${a.label}".`)}>
                            {a.label}
                          </Btn>
                        ))}
                    </div>
                  </div>
                )}

                {open?.id === t.id && open.mode === "reject" && (
                  <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--text)" }}>
                    Remove "{t.label}" from {plural(t.count, "resident", "residents")} and let them know it wasn&apos;t added?
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                      <Btn tone="danger" disabled={busy} onClick={() => act("PATCH", { action: "reject", id: t.id }, `"${t.label}" rejected.`)}>Yes, reject</Btn>
                      <Btn disabled={busy} onClick={() => setOpen(null)}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Approved list */}
      <section>
        <div style={heading}>{isSkill ? "Skills" : "Interests"} list ({view.approved.length})</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} maxLength={LABEL_MAX} placeholder={`Add a${isSkill ? " skill" : "n interest"}`} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          <Btn tone="primary" disabled={busy || !newLabel.trim()}
            onClick={async () => { if (await act("POST", { label: newLabel, kind }, `"${newLabel.trim()}" added.`)) setNewLabel("") }}>Add</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {view.approved.map(t => (
            <div key={t.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>{t.label}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}> · {plural(t.count, "resident", "residents")}</span>
                </div>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <Btn disabled={busy} onClick={() => toggleOpen(t.id, "rename", t.label)}>Rename</Btn>
                  {moveBtn(t)}
                  <Btn tone="danger" disabled={busy} onClick={() => toggleOpen(t.id, "retire")}>Retire</Btn>
                </div>
              </div>
              {open?.id === t.id && open.mode === "rename" && (
                <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                  <input value={field} onChange={e => setField(e.target.value)} maxLength={LABEL_MAX} style={{ ...inputStyle, flex: 1, minWidth: 0 }} autoFocus />
                  <Btn tone="primary" disabled={busy || !field.trim()} onClick={() => act("PATCH", { action: "rename", id: t.id, label: field }, "Renamed.")}>Save</Btn>
                </div>
              )}
              {open?.id === t.id && open.mode === "retire" && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text)" }}>
                  Hide "{t.label}" everywhere? Residents&apos; picks are kept in case you restore it.
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                    <Btn tone="danger" disabled={busy} onClick={() => act("PATCH", { action: "retire", id: t.id }, `"${t.label}" retired.`)}>Yes, retire</Btn>
                    <Btn disabled={busy} onClick={() => setOpen(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Retired */}
      {view.retired.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowRetired(v => !v)} style={{ ...heading, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            Retired ({view.retired.length}) {showRetired ? "▲" : "▼"}
          </button>
          {showRetired && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {view.retired.map(t => (
                <div key={t.id} style={{ ...card, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: "0.88rem", color: "var(--text-dim)" }}>{t.label} · {plural(t.count, "resident", "residents")}</div>
                  <Btn disabled={busy} onClick={() => act("PATCH", { action: "restore", id: t.id }, `"${t.label}" restored.`)}>Restore</Btn>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
