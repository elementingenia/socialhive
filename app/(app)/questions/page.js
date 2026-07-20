"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import { useUI } from "@/lib/UIContext"

const STATUS = {
  open:     { label: "Awaiting answer", colour: "var(--amber-dark)" },
  answered: { label: "Answered",        colour: "var(--teal)" },
  followup: { label: "Follow-up sent",  colour: "var(--amber-dark)" },
  closed:   { label: "Closed",          colour: "var(--text-dim)" },
}
const fmt = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""

function Pill({ status }) {
  const s = STATUS[status] || STATUS.open
  return <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#fff", background: s.colour, borderRadius: 999, padding: "0.15rem 0.55rem" }}>{s.label}</span>
}

export default function QuestionsPage() {
  const { refreshQuestionCount } = useUI()
  const [tab, setTab]         = useState("mine")
  const [mine, setMine]       = useState(null)
  const [answering, setAnswering] = useState(null)
  const [openId, setOpenId]   = useState(null)

  const loadLists = useCallback(async () => {
    const [m, a] = await Promise.all([
      authedFetch("/api/questions?box=mine").then(r => r.ok ? r.json() : []),
      authedFetch("/api/questions?box=answering").then(r => r.ok ? r.json() : []),
    ])
    setMine(m); setAnswering(a)
    refreshQuestionCount()
  }, [refreshQuestionCount])

  useEffect(() => { loadLists() }, [loadLists])

  // Tapping the header Questions icon while already on this page (even inside a
  // thread) should always return to the full list — same pattern as admin-reset.
  useEffect(() => {
    function reset() { setOpenId(null); loadLists() }
    window.addEventListener("questions-reset", reset)
    return () => window.removeEventListener("questions-reset", reset)
  }, [loadLists])

  const list = tab === "mine" ? mine : answering
  const showAnswering = (answering && answering.length > 0)

  if (openId) {
    return <Thread id={openId} onBack={() => { setOpenId(null); loadLists() }} />
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)}
      style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit",
        fontWeight: tab === key ? 800 : 600, fontSize: "0.9rem",
        background: tab === key ? "var(--surface)" : "transparent", color: tab === key ? "var(--text)" : "var(--text-dim)",
        boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>{label}</button>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 900, margin: "0 0 0.25rem" }}>Questions</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", margin: "0 0 1rem", lineHeight: 1.5 }}>
        Ask a question from any hub, club or event page — it goes privately to the right contact.
      </p>

      {showAnswering && (
        <div style={{ display: "flex", gap: "0.35rem", background: "var(--surface2)", borderRadius: 12, padding: "0.3rem", marginBottom: "1rem" }}>
          {tabBtn("mine", "My questions")}
          {tabBtn("answering", `To answer${answering.filter(q => q.status === "open" || q.status === "followup").length ? ` (${answering.filter(q => q.status === "open" || q.status === "followup").length})` : ""}`)}
        </div>
      )}

      {list === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "2.5rem 1rem" }}>
          <div style={{ fontSize: "2rem" }}>💬</div>
          <div style={{ fontWeight: 700, marginTop: "0.5rem" }}>{tab === "mine" ? "You haven't asked anything yet" : "Nothing to answer"}</div>
          <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{tab === "mine" ? "Use “Ask a question” on any hub, club or event." : "Questions routed to you will appear here."}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {list.map(q => {
            const unseen = tab === "mine" && !q.asker_seen_at && (q.status === "answered" || q.status === "closed")
            const needsMe = tab === "answering" && (q.status === "open" || q.status === "followup")
            return (
              <button key={q.id} onClick={() => setOpenId(q.id)}
                style={{ textAlign: "left", background: "var(--surface)", border: `1px solid ${needsMe || unseen ? "var(--amber-dark)" : "var(--border)"}`, borderRadius: 12, padding: "0.85rem 1rem", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.subject}</span>
                  <Pill status={q.status} />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  {q.context_label}{tab === "answering" ? ` · from ${q.asker_name}` : ""} · {fmt(q.updated_at)}
                  {q.reply_count > 0 ? ` · ${q.reply_count} repl${q.reply_count === 1 ? "y" : "ies"}` : ""}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Thread({ id, onBack }) {
  const [data, setData]   = useState(null)
  const [reply, setReply] = useState("")
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState("")
  const [withdrawing, setWithdrawing] = useState(false)

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/questions/${id}`)
    if (res.ok) setData(await res.json())
    else setData({ error: true })
  }, [id])
  useEffect(() => { load() }, [load])

  async function send() {
    if (!reply.trim()) return
    setBusy(true); setError("")
    const res = await authedFetch(`/api/questions/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply }),
    })
    if (res.ok) { setReply(""); await load() }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Could not send.") }
    setBusy(false)
  }

  async function withdraw() {
    if (!confirm("Withdraw this question? It will be removed for everyone.")) return
    setWithdrawing(true)
    const res = await authedFetch(`/api/questions/${id}`, { method: "DELETE" })
    if (res.ok) onBack()
    else { setWithdrawing(false); setError("Could not withdraw. Please try again.") }
  }

  if (!data) return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
  if (data.error) return <div style={{ padding: "1.5rem" }}><button onClick={onBack} style={backBtn}>← Back</button><p style={{ color: "var(--text-dim)" }}>This question isn't available.</p></div>

  const q = data.question
  const replyHint = data.isAsker ? "Add a follow-up" : "Write your answer"

  return (
    <div style={{ padding: "1rem 1rem 6rem" }}>
      <button onClick={onBack} style={backBtn}>← Back</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", margin: "0.75rem 0 0.25rem" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 900, margin: 0 }}>{q.subject}</h1>
        <Pill status={q.status} />
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "1rem" }}>{q.context_label} · asked by {q.asker_name} · {fmt(q.created_at)}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Bubble who={q.asker_name} when={q.created_at} text={q.body} mine={data.isAsker} />
        {data.replies.map(r => (
          <Bubble key={r.id} who={r.author} when={r.created_at} text={r.body}
            mine={r.is_answer ? !data.isAsker : data.isAsker}
            tag={r.is_answer ? "Answer" : "Follow-up"} />
        ))}
      </div>

      {q.status === "closed" && !data.canReply && (
        <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "1.25rem" }}>This question is closed.</div>
      )}

      {data.canReply && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.35rem" }}>{replyHint}</div>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4}
            placeholder={data.isAsker ? "Anything to add…" : "Type your answer…"}
            style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
          {error && <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: "0.4rem" }}>{error}</div>}
          <button onClick={send} disabled={busy || !reply.trim()}
            style={{ marginTop: "0.6rem", width: "100%", padding: "0.8rem", borderRadius: 12, border: "none", background: "var(--teal)", color: "#fff", fontWeight: 700, cursor: busy || !reply.trim() ? "not-allowed" : "pointer", opacity: busy || !reply.trim() ? 0.6 : 1, fontFamily: "inherit" }}>
            {busy ? "Sending…" : (data.isAsker ? "Send follow-up" : "Send answer")}
          </button>
        </div>
      )}
      {!data.canReply && q.status !== "closed" && (
        <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "1.25rem" }}>
          {data.isAsker ? "Waiting for an answer — you'll be notified." : "Waiting on the asker."}
        </div>
      )}

      {data.isAsker && (
        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button onClick={withdraw} disabled={withdrawing}
            style={{ background: "none", border: "none", color: "#b91c1c", fontWeight: 700, fontSize: "0.82rem", textDecoration: "underline", cursor: withdrawing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: withdrawing ? 0.6 : 1 }}>
            {withdrawing ? "Withdrawing…" : "Withdraw this question"}
          </button>
        </div>
      )}
    </div>
  )
}

function Bubble({ who, when, text, mine, tag }) {
  return (
    <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%", background: mine ? "var(--teal)" : "var(--surface)", color: mine ? "#fff" : "var(--text)", border: mine ? "none" : "1px solid var(--border)", borderRadius: 14, padding: "0.65rem 0.85rem" }}>
      <div style={{ fontSize: "0.7rem", opacity: 0.8, marginBottom: "0.2rem", fontWeight: 700 }}>
        {tag ? `${tag} · ` : ""}{who} · {fmt(when)}
      </div>
      <div style={{ fontSize: "0.9rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  )
}

const backBtn = { background: "none", border: "none", color: "var(--text-dim)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", padding: 0 }
