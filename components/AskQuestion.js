"use client"
import { useState } from "react"
import { authedFetch } from "@/lib/getAuthToken"

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px",
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}

// Ask-a-question entry point. Drop it anywhere with the context it belongs to:
//   <AskQuestion contextType="club" contextKey={club.id} contextLabel="Dinner Club" colour="var(--purple)" />
// Home uses contextType="general" (no key).
export default function AskQuestion({ contextType, contextKey, contextLabel, colour = "var(--amber)", block = false }) {
  const [open, setOpen]       = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody]       = useState("")
  const [busy, setBusy]       = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState("")

  function reset() { setSubject(""); setBody(""); setError(""); setDone(false) }

  async function submit() {
    if (!subject.trim() || !body.trim()) { setError("Please add a subject and your question."); return }
    setBusy(true); setError("")
    try {
      const res = await authedFetch("/api/questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context_type: contextType, context_key: contextKey ?? null, subject, body }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Could not send. Please try again."); setBusy(false); return }
      setDone(true)
    } catch { setError("Could not send. Please try again.") }
    setBusy(false)
  }

  return (
    <>
      <button onClick={() => { reset(); setOpen(true) }}
        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", width: block ? "100%" : "auto", justifyContent: "center",
          padding: "0.6rem 1rem", borderRadius: 12, border: `1.5px solid ${colour}`, background: "var(--surface)",
          color: colour, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
        <span aria-hidden>💬</span> Ask a question
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "var(--surface)", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: "1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -4px 24px rgba(0,0,0,0.25)" }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "1rem 0.5rem" }}>
                <div style={{ fontSize: "2rem" }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", margin: "0.5rem 0 0.25rem" }}>Question sent</div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  It's gone to the {contextLabel || "team"} contact{contextType === "general" ? "s" : ""}. You'll get a notification when it's answered — track it any time under Questions.
                </div>
                <button onClick={() => setOpen(false)} style={{ marginTop: "1rem", padding: "0.7rem 1.5rem", borderRadius: 12, border: "none", background: colour, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: "0.25rem" }}>Ask a question</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.9rem" }}>
                  About <strong>{contextLabel || "the Hive"}</strong>. It goes privately to the right contact — not a public post.
                </div>
                <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
                  placeholder="Subject (a few words)" style={{ ...inputStyle, marginBottom: "0.6rem" }} />
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
                  placeholder="Your question…" style={{ ...inputStyle, resize: "vertical" }} />
                {error && <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: "0.5rem" }}>{error}</div>}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                  <button onClick={() => setOpen(false)} style={{ flex: 1, padding: "0.75rem", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={submit} disabled={busy} style={{ flex: 2, padding: "0.75rem", borderRadius: 12, border: "none", background: colour, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit" }}>{busy ? "Sending…" : "Send question"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
