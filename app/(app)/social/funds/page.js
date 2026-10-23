"use client"
// Hive Funds page (2026-10-23, Element_Happenings_Hive_Funds_Transparency_
// Scope_Answered). Everything residents need to see where Social Hive's
// money goes: the summary, each event's breakdown, and money moved between
// events. Visibility is set in Admin > Hub Settings > Social Hive.

import { useState } from "react"
import { useHiveFunds, hiveFundsAction } from "@/lib/useHiveFunds"
import { fmtMoney } from "@/lib/hiveFunds"
import { sydneyTodayStr } from "@/lib/date"
import { MoneyRow, HiveEventFinances, HiveLineForm, HiveLineRow, inputStyle } from "@/components/HiveFunds"

const COLOUR = "var(--terracotta)"
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "0.9rem 1rem", marginBottom: "1rem" }
const heading = { fontWeight: 800, color: COLOUR, fontSize: "0.95rem", marginBottom: "0.4rem" }
const labelStyle = { fontSize: "0.8rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: 4, display: "block" }
const btn = (bg = COLOUR, fg = "#fff", border = "none") => ({
  padding: "0.6rem 1rem", borderRadius: 10, border, background: bg, color: fg,
  fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
})
const linkBtn = { background: "none", border: "none", color: COLOUR, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", padding: 0 }

function fmtDate(str) {
  if (!str) return ""
  const [y, m, d] = String(str).slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

// Declare (or re-declare) the starting balance. Admin only.
function OpeningForm({ summary, onDone }) {
  const [mode, setMode] = useState("cash")
  const [value, setValue] = useState("")
  const [entryDate, setEntryDate] = useState(sydneyTodayStr())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function save(e) {
    e.preventDefault(); setErr("")
    if (value.trim() === "" || !Number.isFinite(Number(value.replace(/[$,\s]/g, "")))) return setErr("Enter an amount")
    setBusy(true)
    try {
      await hiveFundsAction({
        action: "set_opening", entry_date: entryDate, note,
        ...(mode === "cash" ? { cash_counted: value } : { amount: value }),
      })
      onDone()
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  const toggle = (k, label) => (
    <button type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
      style={{ flex: 1, padding: "0.6rem", borderRadius: 10, fontFamily: "inherit", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
        border: `1px solid ${mode === k ? COLOUR : "var(--border)"}`, background: mode === k ? COLOUR : "var(--surface)", color: mode === k ? "#fff" : "var(--text)" }}>
      {label}
    </button>
  )

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginTop: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>{toggle("cash", "I've counted the cash")}{toggle("amount", "Enter the balance")}</div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        {mode === "cash"
          ? "Count everything in the cash tin and enter the total. The app takes off money already paid for events on or after the date below, and any refunds still owed, because those are counted from the booking records."
          : "Enter the Hive's own money only — leave out money already paid for events on or after the date below, and refunds still owed."}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <div>
          <label style={labelStyle}>{mode === "cash" ? "Cash counted ($)" : "Starting balance ($)"}</label>
          <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>As at</label>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="e.g. Counted by Iain and Julie" style={inputStyle} />
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Events dated before this date are left out — their money is already in the starting balance.
        {summary?.hasOpening && " Declaring again replaces the current starting balance; the old one stays on record."}
      </div>
      {err && <div role="alert" style={{ color: "var(--red, #b91c1c)", fontSize: "0.85rem", fontWeight: 600 }}>{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" onClick={onDone} style={btn("none", "var(--text-dim)", "1px solid var(--border)")}>Cancel</button>
        <button type="submit" disabled={busy} style={{ ...btn(), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Declare"}</button>
      </div>
    </form>
  )
}

function EventBlock({ ev }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, marginBottom: "0.6rem", overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem",
          padding: "0.75rem 0.9rem", background: "var(--surface)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: "0.92rem", color: "var(--text)" }}>
            {ev.title}{ev.archived && <span style={{ fontWeight: 600, color: "var(--text-dim)" }}> (cancelled)</span>}
          </span>
          <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-dim)" }}>{fmtDate(ev.event_date)}</span>
        </span>
        <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: "0.92rem", color: ev.result < 0 ? "var(--text)" : "var(--green)" }}>{fmtMoney(ev.result)}</span>
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--teal)" }}>{open ? "▲ Hide" : "▼ Details"}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: "0.6rem 0.9rem 0.9rem", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          <HiveEventFinances eventId={ev.id} asAccordion={false} />
        </div>
      )}
    </div>
  )
}

export default function HiveFundsPage() {
  const { data, loading } = useHiveFunds("social")
  const [declaring, setDeclaring] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showFinalised, setShowFinalised] = useState(false)

  if (loading) {
    return <div style={{ padding: "1.25rem 1rem" }}><div style={{ height: 180, borderRadius: 16, background: "var(--surface2)" }} /></div>
  }

  if (!data?.visible) {
    return (
      <div style={{ padding: "1.25rem 1rem 6rem" }}>
        <div style={card}>
          <div style={heading}>💰 Hive Funds</div>
          <div style={{ fontSize: "0.9rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
            {data?.error || "Hive Funds isn't switched on."}
            {data?.audience && " Turn it on in Admin › Hub Settings › Social Hive."}
          </div>
        </div>
      </div>
    )
  }

  const s = data.summary
  const inProgress = data.events.filter(e => !e.finalised)
  const finalised = data.events.filter(e => e.finalised).reverse()

  return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      <div style={card}>
        <div style={heading}>💰 Hive Funds</div>
        {!s.hasOpening ? (
          <div style={{ fontSize: "0.9rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
            {data.isAdmin ? "Start by declaring the starting balance." : "Not set up yet."}
          </div>
        ) : (
          <>
            <MoneyRow label="Funds held" value={s.fundsHeld} sub="From finished events and money between events" />
            <MoneyRow label="Collected for upcoming events" value={s.collected} colour="var(--green)" sub={`${s.inProgressCount} event${s.inProgressCount === 1 ? "" : "s"} not yet finalised`} />
            <MoneyRow label="Spent on upcoming events" value={-s.spent} />
            <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.3rem", paddingTop: "0.2rem" }}>
              <MoneyRow label="Balance as it stands" value={s.balance} strong colour={COLOUR} />
            </div>
            {s.refundsOwed > 0 && (
              <>
                <MoneyRow label="Refunds owed to residents" value={s.refundsOwed} colour="var(--amber-dark)" sub="Held in cash, not Hive money" />
                <MoneyRow label="Cash that should be in the tin" value={s.cashHeld} />
              </>
            )}
          </>
        )}
      </div>

      <div style={card}>
        <div style={heading}>Starting balance</div>
        {data.opening ? (
          <>
            <MoneyRow label={`As at ${fmtDate(data.opening.entry_date)}`} value={data.opening.amount} />
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.5 }}>{data.opening.description}</div>
          </>
        ) : (
          <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>Not declared yet.</div>
        )}
        {data.isAdmin && !declaring && (
          <button type="button" style={{ ...linkBtn, marginTop: "0.5rem" }} onClick={() => setDeclaring(true)}>
            {data.opening ? "Declare again" : "Declare starting balance"}
          </button>
        )}
        {declaring && <OpeningForm summary={s} onDone={() => setDeclaring(false)} />}
      </div>

      {s.hasOpening && (
        <>
          <div style={card}>
            <div style={heading}>Events in progress</div>
            {inProgress.length === 0
              ? <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>None.</div>
              : inProgress.map(ev => <EventBlock key={ev.id} ev={ev} />)}
          </div>

          <div style={card}>
            <div style={heading}>Between events</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Money the Hive spent or received outside an event.</div>
            {data.between.length === 0 && !adding && <div style={{ fontSize: "0.88rem", color: "var(--text-dim)" }}>None.</div>}
            {data.between.map(l => <HiveLineRow key={l.id} line={l} canEdit={data.canManage} />)}
            {data.canManage && !adding && (
              <button type="button" style={{ ...linkBtn, marginTop: "0.5rem" }} onClick={() => setAdding(true)}>+ Add money in or out</button>
            )}
            {adding && <div style={{ marginTop: "0.5rem" }}><HiveLineForm onDone={() => setAdding(false)} /></div>}
          </div>

          {finalised.length > 0 && (
            <div style={card}>
              <button type="button" onClick={() => setShowFinalised(v => !v)} aria-expanded={showFinalised}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ ...heading, marginBottom: 0 }}>Finished events ({finalised.length})</span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{showFinalised ? "▲" : "▼"}</span>
              </button>
              {showFinalised && <div style={{ marginTop: "0.6rem" }}>{finalised.map(ev => <EventBlock key={ev.id} ev={ev} />)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
