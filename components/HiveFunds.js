"use client"
// components/HiveFunds.js
//
// Hive Funds ledger UI (2026-10-23). Sums come from the server
// (lib/hiveFunds.js via /api/hive-funds); nothing here re-derives them.
//   HiveFundsTile      -- Social Hive home summary, taps through to /social/funds
//   HiveEventFinances  -- per-event breakdown + entry, on each event card
//   HiveLineForm       -- add/edit a money line (event outgoing or between events)

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useHiveFunds, hiveFundsAction } from "@/lib/useHiveFunds"
import { fmtMoney, AUDIENCES, AUDIENCE_LABELS } from "@/lib/hiveFunds"
import { sydneyTodayStr } from "@/lib/date"
import { MAX_ATTACHMENT_BYTES, tooLargeMessage } from "@/lib/attachmentLimits"

const COLOUR = "var(--terracotta)"

export const inputStyle = {
  width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
}
const labelStyle = { fontSize: "0.8rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: 4, display: "block" }
const btn = (bg = COLOUR, fg = "#fff", border = "none") => ({
  padding: "0.6rem 1rem", borderRadius: 10, border, background: bg, color: fg,
  fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
})
const linkBtn = { background: "none", border: "none", color: COLOUR, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", padding: 0 }

function fmtShortDate(str) {
  if (!str) return ""
  const [y, m, d] = String(str).slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

// One label / value row.
export function MoneyRow({ label, value, strong, colour, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", padding: "0.3rem 0" }}>
      <span style={{ fontSize: strong ? "0.95rem" : "0.88rem", fontWeight: strong ? 800 : 500, color: "var(--text)" }}>
        {label}
        {sub && <span style={{ display: "block", fontSize: "0.75rem", fontWeight: 400, color: "var(--text-dim)" }}>{sub}</span>}
      </span>
      <span style={{ fontSize: strong ? "1.05rem" : "0.92rem", fontWeight: strong ? 800 : 700, color: colour || "var(--text)", whiteSpace: "nowrap" }}>
        {fmtMoney(value)}
      </span>
    </div>
  )
}

// ── Home tile ─────────────────────────────────────────────────────────────
export function HiveFundsTile({ fund = "social" }) {
  const router = useRouter()
  const { data } = useHiveFunds(fund)
  if (!data?.visible) return null
  const s = data.summary
  return (
    <button type="button" onClick={() => router.push("/social/funds")}
      style={{ width: "100%", textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)",
        borderLeft: `4px solid ${COLOUR}`, borderRadius: 16, padding: "0.9rem 1rem", marginBottom: "1rem",
        cursor: "pointer", fontFamily: "inherit", display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <span style={{ fontWeight: 800, color: COLOUR, fontSize: "0.95rem" }}>💰 Hive Funds</span>
        <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Details ›</span>
      </div>
      {!s.hasOpening ? (
        <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>
          {data.isAdmin ? "Declare the starting balance to begin." : "Not set up yet."}
        </div>
      ) : (
        <>
          <MoneyRow label="Funds held" value={s.fundsHeld} />
          <MoneyRow label="Collected for upcoming events" value={s.collected} colour="var(--green)" />
          <MoneyRow label="Spent on upcoming events" value={-s.spent} />
          {s.refundsOwed > 0 && <MoneyRow label="Refunds owed to residents" value={s.refundsOwed} colour="var(--amber-dark)" sub="Held in cash, not Hive money" />}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.3rem", paddingTop: "0.2rem" }}>
            <MoneyRow label="Balance as it stands" value={s.balance} strong colour={s.balance < 0 ? "var(--red, #b91c1c)" : COLOUR} />
          </div>
        </>
      )}
    </button>
  )
}

// ── Receipt upload ────────────────────────────────────────────────────────
async function uploadReceipt(file, fund) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(tooLargeMessage(file))
  const sign = await hiveFundsAction({ action: "sign_receipt", file_name: file.name, content_type: file.type, file_size: file.size }, fund)
  const { error } = await supabase.storage.from("community-docs")
    .uploadToSignedUrl(sign.path, sign.token, file, { contentType: sign.content_type })
  if (error) throw new Error(error.message || "Receipt upload failed")
  return { receipt_url: sign.public_url, receipt_file_name: file.name }
}

// ── Add / edit a money line ───────────────────────────────────────────────
// eventId set -> an outgoing for that event. Not set -> between events,
// with a Money in / Money out choice.
export function HiveLineForm({ fund = "social", eventId = null, line = null, onDone }) {
  const [kind, setKind] = useState(line?.kind || "expense")
  const [amount, setAmount] = useState(line ? String(line.amount) : "")
  const [description, setDescription] = useState(line?.description || "")
  const [entryDate, setEntryDate] = useState(line?.entry_date || sydneyTodayStr())
  const [file, setFile] = useState(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function save(e) {
    e.preventDefault()
    e.stopPropagation()
    setErr("")
    if (!amount.trim() || !(Number(amount.replace(/[$,]/g, "")) > 0)) return setErr("Enter an amount greater than 0")
    if (!description.trim()) return setErr("Say what it was for")
    setBusy(true)
    try {
      let receipt = {}
      if (file) receipt = await uploadReceipt(file, fund)
      else if (removeReceipt) receipt = { receipt_url: null }
      await hiveFundsAction({
        action: line ? "update_line" : "add_line",
        id: line?.id, event_id: eventId, kind: eventId ? "expense" : kind,
        amount, description, entry_date: entryDate, ...receipt,
      }, fund)
      onDone?.()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k, label) => (
    <button type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
      style={{ flex: 1, padding: "0.6rem", borderRadius: 10, fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
        border: `1px solid ${kind === k ? COLOUR : "var(--border)"}`, background: kind === k ? COLOUR : "var(--surface)", color: kind === k ? "#fff" : "var(--text)" }}>
      {label}
    </button>
  )

  return (
    <form onSubmit={save} onClick={e => e.stopPropagation()}
      style={{ display: "flex", flexDirection: "column", gap: "0.65rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.8rem" }}>
      {!eventId && !line && (
        <div style={{ display: "flex", gap: "0.5rem" }}>{toggle("expense", "Money out")}{toggle("income", "Money in")}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <div>
          <label style={labelStyle}>Amount ($)</label>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>What was it for?</label>
        <input value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
          placeholder={eventId ? "e.g. Catering — Woolworths" : kind === "income" ? "e.g. Raffle takings" : "e.g. Replacement urn"} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Receipt (optional, photo or PDF)</label>
        {line?.receipt_url && !file && !removeReceipt ? (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem" }}>
            <a href={line.receipt_url} target="_blank" rel="noreferrer" style={{ color: COLOUR, fontWeight: 700 }}>View receipt</a>
            <button type="button" style={linkBtn} onClick={() => setRemoveReceipt(true)}>Remove</button>
          </div>
        ) : (
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ fontSize: "0.85rem", fontFamily: "inherit", color: "var(--text)" }} />
        )}
      </div>
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.85rem", fontWeight: 600 }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={() => onDone?.()} style={btn("none", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
        <button type="submit" disabled={busy} style={{ ...btn(), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  )
}

// A line in a list, with Edit/Delete for those allowed.
export function HiveLineRow({ line, canEdit, fund = "social", showDate = true }) {
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  if (editing) return <HiveLineForm fund={fund} eventId={line.event_id} line={line} onDone={() => setEditing(false)} />
  const signed = line.kind === "expense" ? -line.amount : line.amount
  async function del() {
    setBusy(true); setErr("")
    try { await hiveFundsAction({ action: "delete_line", id: line.id }, fund) } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <div style={{ padding: "0.45rem 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.88rem", color: "var(--text)", minWidth: 0 }}>
          {line.description}
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)" }}>
            {showDate && fmtShortDate(line.entry_date)}
            {line.entered_by && ` · ${line.entered_by}`}
          </span>
        </span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap", color: signed < 0 ? "var(--text)" : "var(--green)" }}>{fmtMoney(signed)}</span>
      </div>
      {(line.receipt_url || canEdit) && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
          {line.receipt_url && <a href={line.receipt_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: COLOUR, fontWeight: 700, fontSize: "0.8rem" }}>🧾 Receipt</a>}
          {canEdit && !confirmDel && <button type="button" style={linkBtn} onClick={e => { e.stopPropagation(); setEditing(true) }}>Edit</button>}
          {canEdit && !confirmDel && <button type="button" style={{ ...linkBtn, color: "var(--text-dim)" }} onClick={e => { e.stopPropagation(); setConfirmDel(true) }}>Delete</button>}
          {confirmDel && (
            <>
              <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Delete this line?</span>
              <button type="button" disabled={busy} style={{ ...linkBtn, color: "var(--red, #b91c1c)" }} onClick={e => { e.stopPropagation(); del() }}>{busy ? "…" : "Yes, delete"}</button>
              <button type="button" style={{ ...linkBtn, color: "var(--text-dim)" }} onClick={e => { e.stopPropagation(); setConfirmDel(false) }}>No</button>
            </>
          )}
        </div>
      )}
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.8rem" }}>{err}</div>}
    </div>
  )
}

// ── Adjustment editor ─────────────────────────────────────────────────────
function AdjustmentForm({ ev, fund, onDone }) {
  const [value, setValue] = useState(ev.adjustment ? String(ev.adjustment) : "")
  const [note, setNote] = useState(ev.adjustmentNote || "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  async function save(e) {
    e.preventDefault(); e.stopPropagation(); setErr("")
    const n = value.trim() === "" ? 0 : Number(value.replace(/[$,\s]/g, ""))
    if (!Number.isFinite(n)) return setErr("Enter a number, e.g. 40 or -15")
    if (n !== 0 && !note.trim()) return setErr("Explain the adjustment")
    setBusy(true)
    try { await hiveFundsAction({ action: "set_adjustment", event_id: ev.id, adjustment: value, note }, fund); onDone() }
    catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} onClick={e => e.stopPropagation()}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.8rem" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        For money the Paid/Unpaid records don't cover. Use a minus for money taken off. Leave blank to clear.
      </div>
      <div>
        <label style={labelStyle}>Adjustment ($)</label>
        <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 40 or -15" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Details</label>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="e.g. Cash on the door" style={inputStyle} />
      </div>
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.85rem", fontWeight: 600 }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" onClick={onDone} style={btn("none", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
        <button type="submit" disabled={busy} style={{ ...btn(), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  )
}

// ── Per-event breakdown ───────────────────────────────────────────────────
// Renders nothing unless the ledger is switched on for this viewer and the
// event counts (dated on/after the starting balance).
// asAccordion: the collapsed strip used on event cards. false = always open
// (the funds page).
export function HiveEventFinances({ eventId, fund = "social", asAccordion = true }) {
  const { data } = useHiveFunds(fund)
  const [open, setOpen] = useState(!asAccordion)
  const [mode, setMode] = useState(null) // 'add' | 'adjust' | 'finalise' | 'reopen'
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const ev = data?.visible ? (data.events || []).find(e => e.id === eventId) : null
  if (!ev) return null

  async function run(body) {
    setBusy(true); setErr("")
    try { await hiveFundsAction(body, fund); setMode(null); setReason("") }
    catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  const body = (
    <div onClick={e => e.stopPropagation()} style={{ padding: asAccordion ? "0 1rem 0.9rem" : 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <MoneyRow label="Hive funds before this event" value={ev.before} />

      <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--text-dim)", marginTop: "0.5rem" }}>OUTGOINGS</div>
      {ev.outgoings.length === 0 && <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.3rem 0" }}>None entered yet.</div>}
      {ev.outgoings.map(l => <HiveLineRow key={l.id} line={l} canEdit={ev.canEdit} fund={fund} />)}
      {ev.canEdit && mode !== "add" && (
        <button type="button" style={{ ...linkBtn, alignSelf: "flex-start", margin: "0.4rem 0" }} onClick={() => setMode("add")}>+ Add an outgoing</button>
      )}
      {mode === "add" && <div style={{ margin: "0.4rem 0" }}><HiveLineForm fund={fund} eventId={ev.id} onDone={() => setMode(null)} /></div>}
      <MoneyRow label="Total outgoings" value={-ev.outgoingsTotal} />

      <div style={{ borderTop: "1px solid var(--border)", margin: "0.4rem 0 0" }} />
      <MoneyRow label="Collected from residents" value={ev.collected} colour="var(--green)"
        sub={ev.finalised ? "Fixed when finalised" : "From the Paid/Unpaid records"} />
      {(ev.adjustment !== 0 || ev.canEdit) && mode !== "adjust" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", padding: "0.3rem 0" }}>
          <span style={{ fontSize: "0.88rem", color: "var(--text)" }}>
            Adjustment
            {ev.adjustmentNote && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)" }}>{ev.adjustmentNote}</span>}
            {ev.canEdit && <button type="button" style={{ ...linkBtn, display: "block", marginTop: 2 }} onClick={() => setMode("adjust")}>{ev.adjustment ? "Change" : "+ Add an adjustment"}</button>}
          </span>
          <span style={{ fontWeight: 700, fontSize: "0.92rem", whiteSpace: "nowrap" }}>{fmtMoney(ev.adjustment)}</span>
        </div>
      )}
      {mode === "adjust" && <AdjustmentForm ev={ev} fund={fund} onDone={() => setMode(null)} />}
      {ev.refundsOwed > 0 && (
        <div style={{ fontSize: "0.8rem", color: "var(--amber-dark)", padding: "0.2rem 0" }}>
          {fmtMoney(ev.refundsOwed)} refunds still owed to residents — held in cash, not counted as Hive money.
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--border)", margin: "0.4rem 0 0" }} />
      <MoneyRow label="Event result" value={ev.result} strong colour={ev.result < 0 ? "var(--text)" : "var(--green)"} />
      <MoneyRow label={ev.finalised ? "Carried forward" : "Carried forward (so far)"} value={ev.carriedForward} strong colour={COLOUR} />

      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.3rem" }}>
        {ev.finalised ? `✓ Finalised ${fmtShortDate(ev.finalisedAt)}` : "In progress — not yet finalised"}
        {ev.reopenReason && !ev.finalised && ` · Reopened: ${ev.reopenReason}`}
      </div>

      {data.canManage && !ev.finalised && mode !== "finalise" && (
        <button type="button" style={{ ...btn(), alignSelf: "flex-start", marginTop: "0.5rem" }} onClick={() => setMode("finalise")}>Finalise finances</button>
      )}
      {mode === "finalise" && (
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.8rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.88rem", lineHeight: 1.5, marginBottom: "0.6rem" }}>
            This fixes Collected at <strong>{fmtMoney(ev.liveCollected)}</strong>, locks the outgoings and moves the result into Funds held. Only an admin can reopen it.
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setMode(null)} style={btn("none", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => run({ action: "finalise", event_id: ev.id })} style={{ ...btn(), opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Finalise"}</button>
          </div>
        </div>
      )}
      {data.isAdmin && ev.finalised && mode !== "reopen" && (
        <button type="button" style={{ ...linkBtn, alignSelf: "flex-start", marginTop: "0.5rem" }} onClick={() => setMode("reopen")}>Reopen</button>
      )}
      {mode === "reopen" && (
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.8rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={labelStyle}>Why reopen? (kept on record)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} style={inputStyle} />
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setMode(null)} style={btn("none", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
            <button type="button" disabled={busy || !reason.trim()} onClick={() => run({ action: "reopen", event_id: ev.id, reason })} style={{ ...btn(), opacity: busy || !reason.trim() ? 0.6 : 1 }}>Reopen</button>
          </div>
        </div>
      )}
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.85rem", fontWeight: 600 }}>{err}</div>}
    </div>
  )

  if (!asAccordion) return body
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(v => !v) }} aria-expanded={open}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-dim)", fontFamily: "inherit" }}>
        <span>
          <strong style={{ color: "var(--text)" }}>💰 Finances</strong>
          <span style={{ marginLeft: "0.4rem" }}>Spent {fmtMoney(ev.outgoingsTotal)} · Collected {fmtMoney(ev.collected + ev.adjustment)}</span>
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--teal)", whiteSpace: "nowrap" }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && body}
    </div>
  )
}

// ── Admin show/hide switch (Admin > Hub Settings > Social Hive) ───────────

export function HiveFundsAudienceSwitch({ fund = "social", colour = COLOUR }) {
  const { data } = useHiveFunds(fund)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  if (!data) return null
  if (data.ready === false) {
    return <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>Hive Funds needs migration 141 running before it can be switched on.</div>
  }
  const current = data.audience || "off"
  async function choose(a) {
    if (a === current) return
    setBusy(true); setErr("")
    try { await hiveFundsAction({ action: "set_audience", audience: a }, fund) }
    catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <div>
      <div style={{ fontWeight: 800, color: colour, marginBottom: "0.35rem" }}>Hive Funds ledger</div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.5rem" }}>
        Who can see the money held, spent and collected. Start with Admins, Owners and Event Coordinators to set it up, then open it to every resident.
      </div>
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {AUDIENCES.map(a => (
          <button key={a} type="button" role="radio" aria-checked={current === a} disabled={busy} onClick={() => choose(a)}
            style={{ textAlign: "left", padding: "0.65rem 0.9rem", borderRadius: 10, fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem", cursor: busy ? "default" : "pointer",
              border: `1px solid ${current === a ? colour : "var(--border)"}`, background: current === a ? colour : "var(--surface)", color: current === a ? "#fff" : "var(--text)" }}>
            {current === a ? "● " : "○ "}{AUDIENCE_LABELS[a]}
          </button>
        ))}
      </div>
      {current !== "off" && (
        <a href="/social/funds" style={{ display: "inline-block", marginTop: "0.5rem", color: colour, fontWeight: 700, fontSize: "0.85rem" }}>Open Hive Funds ›</a>
      )}
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.85rem", fontWeight: 600, marginTop: 4 }}>{err}</div>}
    </div>
  )
}
