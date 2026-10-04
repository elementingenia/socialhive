"use client"
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authedFetch } from "@/lib/getAuthToken"
import { NAME_MAX, DESCRIPTION_MAX, THRESHOLD_MIN, THRESHOLD_MAX } from "@/lib/groupProposals"

// Admin > Group Proposals (backlog B1, migration 126). Admins only.
//   Waiting for approval -> Approve (goes live) / Edit wording / Decline
//   Ready to create      -> Create club (one tap: proposer = Owner,
//                           everyone who tapped I'd join = members)
//   Collecting           -> live, still short of the threshold
//   Closed               -> created / declined / withdrawn / expired
// Plus the threshold setting (starts at 5).

const inputStyle = {
  width: "100%", padding: "0.6rem 0.85rem", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.92rem", boxSizing: "border-box", fontFamily: "inherit",
}
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.75rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }
const heading = { fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "1.25rem 0 0.5rem" }

function Btn({ children, onClick, tone = "plain", disabled }) {
  const tones = {
    primary: { background: "var(--purple)", color: "#fff", border: "1px solid var(--purple)" },
    danger:  { background: "var(--surface)", color: "#e53e3e", border: "1px solid #e53e3e" },
    plain:   { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" },
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...tones[tone], borderRadius: 8, padding: "0.4rem 0.8rem", fontSize: "0.8rem", fontWeight: 700,
      fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, minHeight: 36,
    }}>{children}</button>
  )
}

function people(n) { return n === 1 ? "1 person" : `${n} people` }

export default function GroupProposalsAdmin({ onCountChange }) {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)   // { id, mode: "edit"|"decline"|"create" }
  const [form, setForm] = useState({ name: "", description: "", reason: "" })
  const [threshold, setThreshold] = useState("")
  const [showClosed, setShowClosed] = useState(false)

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/group-proposals")
    if (!res.ok) { setError("Couldn't load group proposals."); return }
    const d = await res.json()
    setData(d)
    setThreshold(String(d.threshold))
    onCountChange?.(d.pending.length + d.ready.length)
  }, [onCountChange])

  useEffect(() => { load() }, [load])

  async function act(body, okText) {
    setBusy(true); setMsg(null)
    const res = await authedFetch("/api/admin/group-proposals", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d.error || "That didn't work. Please try again." }); return null }
    setMsg({ ok: true, text: typeof okText === "function" ? okText(d) : okText }); setOpen(null)
    await load()
    return d
  }

  function toggle(p, mode) {
    setMsg(null)
    if (open?.id === p.id && open.mode === mode) { setOpen(null); return }
    setOpen({ id: p.id, mode })
    setForm({ name: p.name, description: p.description || "", reason: "" })
  }

  if (error) return <div style={{ color: "#e53e3e", fontSize: "0.85rem" }}>{error}</div>
  if (!data) return <div style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Loading…</div>

  const isOpen = (p, mode) => open?.id === p.id && open.mode === mode

  function panels(p) {
    return (
      <>
        {isOpen(p, "edit") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.25rem" }}>
            <input style={inputStyle} value={form.name} maxLength={NAME_MAX} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} aria-label="Group name" />
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.description} maxLength={DESCRIPTION_MAX}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} aria-label="Description" placeholder="Description (optional)" />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Btn tone="primary" disabled={busy} onClick={() => act({ action: "edit", id: p.id, name: form.name, description: form.description }, "Saved.")}>Save</Btn>
              <Btn onClick={() => setOpen(null)}>Cancel</Btn>
            </div>
          </div>
        )}
        {isOpen(p, "decline") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.25rem" }}>
            <input style={inputStyle} value={form.reason} maxLength={300} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Reason for the proposer (optional)" aria-label="Reason" />
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Btn tone="danger" disabled={busy} onClick={() => act({ action: "decline", id: p.id, reason: form.reason }, `Declined "${p.name}". The proposer has been told.`)}>Decline</Btn>
              <Btn onClick={() => setOpen(null)}>Cancel</Btn>
            </div>
          </div>
        )}
        {isOpen(p, "create") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.5 }}>
            <div>
              This creates the club &quot;{p.name}&quot;
              {p.hasProposer ? <>, makes {p.proposedBy} its Owner</> : <> (the proposer&apos;s account no longer exists, so add an Owner afterwards in Admin &gt; Groups &amp; Clubs)</>}
              {" "}and adds the {people(p.count)} who tapped I&apos;d join as members. They&apos;ll all be notified.
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Btn tone="primary" disabled={busy} onClick={() => act({ action: "create_club", id: p.id },
                d => `"${p.name}" is now a club with ${people(d.members)} joined.`)}>Create club</Btn>
              <Btn onClick={() => setOpen(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </>
    )
  }

  function header(p) {
    return (
      <>
        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.98rem" }}>{p.name}</div>
        {p.description && <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{p.description}</div>}
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Proposed by {p.proposedBy || "a former resident"}</div>
      </>
    )
  }

  function supporters(p) {
    return (
      <div style={{ fontSize: "0.82rem", color: "var(--text)" }}>
        <strong style={{ color: "var(--purple)" }}>{people(p.count)}</strong> would join
        {p.daysLeft != null && <span style={{ color: "var(--text-dim)" }}> · {p.daysLeft === 1 ? "1 day left" : `${p.daysLeft} days left`}</span>}
        {p.supporters.length > 0 && <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: 2 }}>{p.supporters.join(", ")}</div>}
      </div>
    )
  }

  const empty = data.pending.length + data.ready.length + data.live.length === 0

  return (
    <div>
      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.35rem" }}>Group Proposals</div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Residents propose new groups from the Groups &amp; Clubs page. Approve a proposal to show it to everyone. Once enough people tap I&apos;d join, create the club in one tap. Proposals close 60 days after going live.
      </div>

      <div style={{ ...card, flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: "0.85rem" }}>
        <label htmlFor="gp-threshold" style={{ fontSize: "0.88rem", color: "var(--text)", flex: "1 1 180px" }}>People needed before a club can be created</label>
        <input id="gp-threshold" type="number" inputMode="numeric" min={THRESHOLD_MIN} max={THRESHOLD_MAX} value={threshold}
          onChange={e => setThreshold(e.target.value)} style={{ ...inputStyle, width: 80, textAlign: "center", appearance: "none", WebkitAppearance: "none", MozAppearance: "textfield" }} />
        <Btn tone="primary" disabled={busy || String(data.threshold) === threshold}
          onClick={() => act({ action: "set_threshold", threshold }, "Threshold saved.")}>Save</Btn>
      </div>

      {msg && <div style={{ fontSize: "0.85rem", margin: "0.75rem 0 0", color: msg.ok ? "var(--green)" : "#e53e3e" }}>{msg.text}</div>}

      {empty && <div style={{ fontSize: "0.88rem", color: "var(--text-dim)", marginTop: "1.25rem" }}>No open proposals right now.</div>}

      {data.pending.length > 0 && (
        <>
          <div style={heading}>Waiting for approval ({data.pending.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.pending.map(p => (
              <div key={p.id} style={card}>
                {header(p)}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Btn tone="primary" disabled={busy} onClick={() => act({ action: "approve", id: p.id }, `"${p.name}" is now live in Groups & Clubs.`)}>Approve</Btn>
                  <Btn onClick={() => toggle(p, "edit")}>Edit wording</Btn>
                  <Btn tone="danger" onClick={() => toggle(p, "decline")}>Decline…</Btn>
                </div>
                {panels(p)}
              </div>
            ))}
          </div>
        </>
      )}

      {data.ready.length > 0 && (
        <>
          <div style={heading}>Ready to create ({data.ready.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.ready.map(p => (
              <div key={p.id} style={{ ...card, border: "1.5px solid var(--purple)" }}>
                {header(p)}
                {supporters(p)}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Btn tone="primary" onClick={() => toggle(p, "create")}>Create club…</Btn>
                  <Btn onClick={() => toggle(p, "edit")}>Edit wording</Btn>
                  <Btn tone="danger" onClick={() => toggle(p, "decline")}>Decline…</Btn>
                </div>
                {panels(p)}
              </div>
            ))}
          </div>
        </>
      )}

      {data.live.length > 0 && (
        <>
          <div style={heading}>Collecting support ({data.live.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {data.live.map(p => (
              <div key={p.id} style={card}>
                {header(p)}
                {supporters(p)}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Btn onClick={() => toggle(p, "edit")}>Edit wording</Btn>
                  <Btn tone="danger" onClick={() => toggle(p, "decline")}>Close…</Btn>
                </div>
                {panels(p)}
              </div>
            ))}
          </div>
        </>
      )}

      {data.closed.length > 0 && (
        <>
          <button type="button" onClick={() => setShowClosed(s => !s)} style={{ ...heading, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "block" }}>
            Closed ({data.closed.length}) {showClosed ? "▲" : "▼"}
          </button>
          {showClosed && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.closed.map(p => (
                <div key={p.id} style={{ ...card, opacity: 0.85 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{p.name}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-dim)" }}>{p.closedLabel}</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Proposed by {p.proposedBy || "a former resident"} · {people(p.count)} would join
                  </div>
                  {p.declineReason && <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Reason: {p.declineReason}</div>}
                  {p.clubSlug && (
                    <button type="button" onClick={() => router.push(`/clubs/${p.clubSlug}`)} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: "var(--purple)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>Open the club →</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
