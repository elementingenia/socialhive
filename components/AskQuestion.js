"use client"
import { useState, useEffect } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { recipientSummary } from "@/lib/categoryQuestions"
import { Sheet } from "@/components/Sheet"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}

// Ask-a-question entry point. Two modes:
//
//  1. FIXED context (unchanged) -- drop it anywhere with the context it belongs to:
//       <AskQuestion contextType="club" contextKey={club.id} contextLabel="Dinner Club" />
//     Movies, Social and the club landings all use this and are untouched.
//
//  2. PICKER mode (Home only) -- pass pickTarget. Step 1 asks "Who would you
//     like to ask?"; step 2 is the same form as mode 1. Home previously sent
//     every question to context_type 'general' silently, so residents had no
//     idea they were writing to the admins.
//
// Both modes render through the canonical <Sheet> (components/Sheet.js) rather
// than a hand-rolled bottom sheet -- the first version of this was a bespoke
// copy that drifted on z-index (1000 vs 200), corner radius and max-height,
// and had no Portal or sticky close button. Reuse the canonical asset.
export default function AskQuestion({
  contextType, contextKey, contextLabel, colour = "var(--amber)",
  block = false, trigger = null, pickTarget = false, recipientNames = null,
}) {
  const [open, setOpen]       = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody]       = useState("")
  const [busy, setBusy]       = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState("")

  const [targets, setTargets]         = useState(null)   // null = not loaded yet
  const [targetsError, setTargetsErr] = useState("")
  const [picked, setPicked]           = useState(null)

  function reset() {
    setSubject(""); setBody(""); setError(""); setDone(false); setPicked(null)
  }

  useEffect(() => {
    if (!open || !pickTarget || targets !== null) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authedFetch("/api/questions/targets")
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setTargets(data)
      } catch {
        if (!cancelled) { setTargets([]); setTargetsErr("Could not load the list. Please try again.") }
      }
    })()
    return () => { cancelled = true }
  }, [open, pickTarget, targets])

  const activeType  = pickTarget ? picked?.context_type : contextType
  const activeKey   = pickTarget ? picked?.context_key  : contextKey
  const activeLabel = pickTarget ? picked?.label        : contextLabel
  // Picker mode gets names from /api/questions/targets; fixed-context callers
  // may pass them directly (Info > Contacts already has the data, so naming
  // the recipient there costs nothing). Either way the compose step says who
  // it's going to -- that line is the most valuable thing in this feature and
  // shouldn't depend on which entry point you came in through.
  const activeNames = picked?.recipient_names || recipientNames || []

  async function submit() {
    if (!subject.trim() || !body.trim()) { setError("Please add a subject and your question."); return }
    setBusy(true); setError("")
    try {
      const res = await authedFetch("/api/questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context_type: activeType, context_key: activeKey ?? null, subject, body }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Could not send. Please try again."); setBusy(false); return }
      setDone(true)
    } catch { setError("Could not send. Please try again.") }
    setBusy(false)
  }

  const openModal = () => { reset(); setOpen(true) }
  const showPicker = pickTarget && !picked && !done
  const title = done ? "Question sent" : showPicker ? "Who would you like to ask?" : "Ask a question"

  return (
    <>
      {trigger ? trigger(openModal) : (
        <button onClick={openModal}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", width: block ? "100%" : "auto", justifyContent: "center",
            padding: "0.6rem 1rem", borderRadius: 12, border: `1.5px solid ${colour}`, background: "var(--surface)",
            color: colour, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
          <span aria-hidden>💬</span> Ask a question
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={title}
        footer={done ? null : showPicker ? null : (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {pickTarget ? (
              <button onClick={() => { setPicked(null); setError("") }} style={{ flex: 1, padding: "0.75rem", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            ) : (
              <button onClick={() => setOpen(false)} style={{ flex: 1, padding: "0.75rem", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            )}
            <button onClick={submit} disabled={busy} style={{ flex: 2, padding: "0.75rem", borderRadius: 12, border: "none", background: colour, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit" }}>{busy ? "Sending…" : "Send question"}</button>
          </div>
        )}>
        {done ? (
          <div style={{ textAlign: "center", padding: "0.5rem" }}>
            <div style={{ fontSize: "2rem" }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", margin: "0.5rem 0 0.25rem" }}>
              Sent to {activeLabel || "the team"}
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
              You'll get a notification when someone replies — track it any time under Questions.
            </div>
            <button onClick={() => setOpen(false)} style={{ marginTop: "1rem", padding: "0.7rem 1.5rem", borderRadius: 12, border: "none", background: colour, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        ) : showPicker ? (
          <>
            {/* One line per option, name only. Listing every recipient under
                each row was costing several lines of vertical space for
                information the resident doesn't need until they've chosen
                (Iain, 2026-07-27) -- the compose step names them instead. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {targets === null && [1, 2].map(i => (
                <div key={i} style={{ height: 44, borderRadius: 10, background: "var(--surface2)" }} />
              ))}
              {targets?.map(t => (
                <button key={`${t.context_type}-${t.context_key || "none"}`} onClick={() => setPicked(t)}
                  style={{ textAlign: "left", padding: "0.7rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)",
                    background: "var(--surface)", cursor: "pointer", fontFamily: "inherit", width: "100%",
                    fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
                  {t.label}
                </button>
              ))}
              {targets?.length === 0 && (
                <div style={{ textAlign: "center", padding: "1.5rem 1rem", color: "var(--text-dim)", fontSize: "0.88rem" }}>
                  {targetsError || "There's nobody available to ask right now."}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.9rem" }}>
              {activeNames.length ? (
                <>Goes to <strong>{recipientSummary(activeNames)}</strong> — privately, not a public post.</>
              ) : (
                <>About <strong>{activeLabel || "the Hive"}</strong>. It goes privately to the right contact — not a public post.</>
              )}
            </div>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
              placeholder="Subject (a few words)" style={{ ...inputStyle, marginBottom: "0.6rem" }} />
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
              placeholder="Your question…" style={{ ...inputStyle, resize: "vertical" }} />
            {error && <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</div>}
          </>
        )}
      </Sheet>
    </>
  )
}
