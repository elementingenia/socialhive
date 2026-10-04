"use client"
import { useState, useEffect, useCallback } from "react"
import { authedFetch } from "@/lib/getAuthToken"
import ExpandableText from "@/components/ExpandableText"
import { NAME_MAX, DESCRIPTION_MAX, countLine } from "@/lib/groupProposals"

// Propose a group / club (backlog B1, migration 126) -- the resident side,
// shown on the Groups & Clubs page. The page owns the "Propose a group" pill
// and renders ProposeForm at the top when tapped; the default export is the
// "Proposed groups" list under the clubs, and renders nothing at all when
// there are no proposals to show (vertical space rule).

const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit",
}
const labelStyle = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }

export function ProposeForm({ onDone, onCancel }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    setError("")
    if (name.trim().length < 3) { setError("Please give the group a name."); return }
    setSaving(true)
    const res = await authedFetch("/api/group-proposals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(d.error || "That didn't work. Please try again."); return }
    onDone()
  }

  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--purple)", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 800, color: "var(--text)", fontSize: "1rem", marginBottom: "0.35rem" }}>Propose a new group</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.85rem" }}>
        An admin checks it first, then neighbours can tap &quot;I&apos;d join&quot;. When enough people are keen, it becomes a club and you&apos;re its first Owner.
      </div>
      <div style={{ marginBottom: "0.85rem" }}>
        <label style={labelStyle} htmlFor="gp-name">Group name</label>
        <input id="gp-name" style={inputStyle} value={name} maxLength={NAME_MAX}
          onChange={e => setName(e.target.value)} placeholder="e.g. Morning Walkers" />
      </div>
      <div style={{ marginBottom: "0.85rem" }}>
        <label style={labelStyle} htmlFor="gp-desc">What would the group do? (optional)</label>
        <textarea id="gp-desc" style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={description} maxLength={DESCRIPTION_MAX}
          onChange={e => setDescription(e.target.value)} placeholder="e.g. A gentle walk around the village at 7am, three mornings a week." />
      </div>
      {error && <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: "0.6rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: "0.75rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving} style={{ flex: 2, padding: "0.75rem", borderRadius: 10, border: "none", background: "var(--purple)", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}>{saving ? "Sending…" : "Send proposal"}</button>
      </div>
    </div>
  )
}

function ProposalCard({ p, threshold, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [error, setError] = useState("")
  const pending = p.status === "pending"

  async function act(action) {
    setBusy(true); setError("")
    const res = await authedFetch("/api/group-proposals", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, action }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(d.error || "That didn't work. Please try again."); return }
    setConfirmWithdraw(false)
    onChanged()
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px dashed var(--purple)", borderLeft: "4px solid var(--purple)",
      borderRadius: 12, padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.35rem",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", minWidth: 0 }}>{p.name}</span>
        {pending && (
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber-dark)", background: "var(--amber-light)", borderRadius: 12, padding: "0.15rem 0.55rem" }}>Waiting for admin approval</span>
        )}
      </div>
      {p.description && <ExpandableText text={p.description} maxLines={2} fontSize={14} />}
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
        Proposed by {p.proposedBy}
        {!pending && p.daysLeft != null && <> · {p.daysLeft === 1 ? "1 day left" : `${p.daysLeft} days left`}</>}
      </div>

      {!pending && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--purple)" }}>{countLine(p.count, threshold)}</span>
          <button type="button" disabled={busy} onClick={() => act(p.joined ? "leave" : "join")} style={{
            padding: "0.5rem 1rem", minHeight: 40, borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem",
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
            border: "1.5px solid var(--purple)",
            background: p.joined ? "var(--surface)" : "var(--purple)", color: p.joined ? "var(--purple)" : "#fff",
          }}>{p.joined ? "✓ You'd join" : "I'd join"}</button>
        </div>
      )}
      {!pending && p.joined && !p.isMine && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Changed your mind? Tap &quot;✓ You&apos;d join&quot; to take your name off.</div>
      )}

      {p.isMine && (
        confirmWithdraw ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--text)" }}>
            Withdraw this proposal?
            <button type="button" disabled={busy} onClick={() => act("withdraw")} style={{ padding: "0.35rem 0.8rem", borderRadius: 8, border: "1px solid #b91c1c", background: "var(--surface)", color: "#b91c1c", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Yes, withdraw</button>
            <button type="button" onClick={() => setConfirmWithdraw(false)} style={{ padding: "0.35rem 0.8rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>No</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmWithdraw(true)} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--text-dim)", fontSize: "0.8rem", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Withdraw my proposal</button>
        )
      )}
      {error && <div style={{ color: "#b91c1c", fontSize: "0.82rem" }}>{error}</div>}
    </div>
  )
}

export default function GroupProposals({ refreshKey }) {
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/group-proposals")
    if (!res.ok) { setData({ threshold: 5, proposals: [] }); return }
    setData(await res.json())
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const proposals = data?.proposals || []
  if (proposals.length === 0) return null

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>Proposed groups</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {proposals.map(p => <ProposalCard key={p.id} p={p} threshold={data.threshold} onChanged={load} />)}
      </div>
    </div>
  )
}
