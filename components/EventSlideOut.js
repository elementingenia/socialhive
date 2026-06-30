"use client"
import { useState, useEffect, useRef } from "react"
import { HUB_COLOURS } from "@/lib/navUtils"
import { BusIcon, CalendarIcon } from "@/components/NavIcons"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

function fmtTime(t) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`
}

function fmtCost(cost) {
  if (!cost || cost === 0) return "Free to attend"
  return `$${parseFloat(cost).toFixed(2)}`
}

function CapacityBar({ booked, max, waitlist }) {
  const pct = max > 0 ? Math.min(100, (booked / max) * 100) : 0
  const left = Math.max(0, max - booked)
  const colour = pct >= 85 ? "var(--danger)" : pct >= 55 ? "var(--amber)" : "var(--green)"
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: colour, borderRadius: 4, transition: "width 0.4s ease", minWidth: pct > 0 ? 6 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-dim)" }}>
        <span>{booked}/{max} seats taken{waitlist > 0 && ` · ${waitlist} waiting`}</span>
        <span style={{ color: left === 0 ? "var(--danger)" : colour, fontWeight: 600 }}>
          {left === 0 ? "Full" : `${left} left`}
        </span>
      </div>
    </div>
  )
}

function SeatSelector({ value, min, max, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Seats:</span>
      <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          style={{ width: 44, height: 44, border: "none", background: "var(--surface2)", fontSize: 20, cursor: value <= min ? "default" : "pointer", color: value <= min ? "#ccc" : "var(--text)", fontWeight: 700 }}>−</button>
        <span style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          style={{ width: 44, height: 44, border: "none", background: "var(--surface2)", fontSize: 20, cursor: value >= max ? "default" : "pointer", color: value >= max ? "#ccc" : "var(--text)", fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

function StatusPill({ label, colour, bg }) {
  return (
    <div style={{ display: "inline-block", padding: "6px 16px", background: bg || colour + "20", color: colour,
      borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${colour}` }}>{label}</div>
  )
}

function Toast({ msg, type }) {
  if (!msg) return null
  const bg = type === "error" ? "var(--danger)" : type === "warn" ? "var(--amber-dark)" : "#15803d"
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: bg, color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>{msg}</div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel, paymentNote }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 320 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Are you sure?</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: paymentNote ? 8 : 20, lineHeight: 1.5 }}>{message}</div>
        {paymentNote && (
          <div style={{ fontSize: 12, color: "var(--amber-dark)", background: "var(--amber-light)", padding: "8px 12px", borderRadius: 8, marginBottom: 16, lineHeight: 1.5 }}>
            ⚠️ {paymentNote}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>Keep it</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "11px 0", background: "var(--danger)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>Yes, cancel</button>
        </div>
      </div>
    </div>
  )
}

function SplitDialog({ offer, onAccept, onDecline }) {
  return (
    <div onClick={onDecline} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Not quite enough seats</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.5 }}>
          Only <strong>{offer.confirmed}</strong> seat{offer.confirmed !== 1 ? "s" : ""} available right now.
          We can confirm {offer.confirmed} and add {offer.waitlisted} to the waitlist.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDecline} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>No thanks</button>
          <button onClick={onAccept} style={{ flex: 1, padding: "11px 0", background: "var(--amber)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>Accept split</button>
        </div>
      </div>
    </div>
  )
}
function WaitlistDialog({ offer, onAccept, onDecline }) {
  return (
    <div onClick={onDecline} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>This event is full</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.5 }}>
          There are no seats available right now. Would you like to join the waitlist
          for <strong>{offer.seats}</strong> seat{offer.seats !== 1 ? "s" : ""}? You&apos;ll automatically be confirmed
          if a spot opens up.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDecline} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>No thanks</button>
          <button onClick={onAccept} style={{ flex: 1, padding: "11px 0", background: "var(--amber)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>Join waitlist</button>
        </div>
      </div>
    </div>
  )
}

// ── EC names display ──────────────────────────────────────────────────────────
function ECNames({ coordinators, colour }) {
  if (!coordinators?.length) return null
  return (
    <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span>👤</span>
      <span>Co-ordinator{coordinators.length > 1 ? "s" : ""}:</span>
      {coordinators.map((ec, i) => (
        <span key={ec.member_id} style={{ fontWeight: 600, color: "var(--text)" }}>
          {ec.members?.name || ec.members?.username}{i < coordinators.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  )
}

// ── Coordinator Panel ─────────────────────────────────────────────────────────
function CoordinatorPanel({ event, colour, onRefresh, currentMember }) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState(null)
  const [toast,       setToast]       = useState(null)
  const [editNotes,   setEditNotes]   = useState(false)
  const [editDesc,    setEditDesc]    = useState(false)
  const [editWelcome, setEditWelcome] = useState(false)
  const [notes,       setNotes]       = useState("")
  const [desc,        setDesc]        = useState("")
  const [welcome,     setWelcome]     = useState("")
  const [saving,      setSaving]      = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const isMovie = event.hub_type === "movie"
  const isBook  = event.hub_type === "bookclub"

  const inputStyle = { width: "100%", padding: "0.6rem 0.8rem", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)", fontSize: "0.88rem", boxSizing: "border-box", fontFamily: "inherit" }

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function load() {
    setLoading(true)
    setApiError(null)
    try {
      const token = await getToken()
      const res = await fetch(`/api/coordinator?event_id=${event.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await res.json()
      if (!res.ok) {
        setApiError(d.error || `Error ${res.status}`)
        setLoading(false)
        return
      }
      setData(d)
      setNotes(d.coordinator_notes || "")
      setDesc(d.description || "")
      setWelcome(d.welcome_message || "")
    } catch (e) {
      setApiError(e.message || "Network error")
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])

  async function patchAction(body) {
    const token = await getToken()
    const res = await fetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.id, ...body }),
    })
    return res.ok
  }

  async function togglePayment(booking) {
    const next = booking.payment_status === "confirmed" ? "pending" : "confirmed"
    const ok = await patchAction({ action: "set_payment", booking_id: booking.id, payment_status: next })
    if (ok) { showToast(next === "confirmed" ? "Marked as paid" : "Marked as unpaid"); load() }
    else showToast("Failed to update", "error")
  }

  async function toggleRefund(booking) {
    const isRefunded = booking.payment_status === "refunded"
    const ok = await patchAction({ action: "set_refund", booking_id: booking.id, refunded: !isRefunded })
    if (ok) { showToast(isRefunded ? "Refund mark removed" : "Refund marked"); load() }
    else showToast("Failed", "error")
  }

  async function cancelBooking(bookingId) {
    const ok = await patchAction({ action: "cancel_booking", booking_id: bookingId })
    if (ok) {
      // If member had a split booking, cancel remaining rows too
      const extraIds = cancelTarget._allIds?.slice(1) || []
      for (const extraId of extraIds) {
        await fetch("/api/coordinator", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "cancel_booking", booking_id: extraId }),
        })
      }
      showToast("Booking cancelled"); setCancelTarget(null); load(); onRefresh()
    }
    else showToast("Failed to cancel", "error")
  }

  async function saveField(field, value) {
    setSaving(true)
    const ok = await patchAction({ action: "update_event", [field]: value })
    setSaving(false)
    if (ok) {
      showToast("Saved")
      if (field === "coordinator_notes") setEditNotes(false)
      if (field === "description") setEditDesc(false)
      if (field === "welcome_message") setEditWelcome(false)
      load()
    } else showToast("Failed to save", "error")
  }

  if (loading) return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `2px solid ${colour}` }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>Loading coordinator view…</div>
    </div>
  )

  if (apiError) return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `2px solid ${colour}` }}>
      <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 10px", background: "var(--danger)10", borderRadius: 8 }}>
        ⚠ Coordinator view unavailable: {apiError}
      </div>
      <button onClick={load} style={{ marginTop: 8, fontSize: 12, color: colour, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
    </div>
  )

  const bookings = data?.bookings || []
  const confirmed = bookings.filter(b => b.status === "confirmed")
  const waitlisted = bookings.filter(b => b.status === "waitlist")
  const cancelled = bookings.filter(b => b.status === "cancelled")
  // Refund due: payment_required event, confirmed booking was cancelled (payment was made but not refunded)
  // We track these as cancelled bookings where payment_status is NOT 'refunded' and was previously 'confirmed'
  // Actually: we only see active bookings. Cancelled bookings are deleted. Refund tracking is via payment_status = 'pending' on a cancelled booking.
  // Since we delete on cancel, refund due = confirmed bookings that have been switched to payment_status 'pending' after a refund is owed.
  // Per scope: "Refund Due" section only appears when payment_required AND a confirmed-paid booking is cancelled.
  // For simplicity, show refund section for bookings where payment_status was 'confirmed' but booking was then cancelled - 
  // but since we delete on cancel this is tricky. The EC can manually toggle refund on active bookings.
  // The cleaner approach: ECs cancel the booking via the panel (which deletes it), but BEFORE that they can set a refund_due flag.
  // For MVP: show "Refund Due" for bookings where payment_status = 'pending' (meaning they were confirmed but now awaiting refund decision)

  const paymentRequired = data?.payment_required
  // Bookings pending refund decision = those where payment was received but booking may need refund
  // We'll show refund section for bookings with payment_status = 'confirmed' that EC wants to cancel

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `2px solid ${colour}` }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {cancelTarget && (
        <ConfirmDialog
          message={`Cancel booking for ${cancelTarget.members?.name || cancelTarget.members?.username}?`}
          paymentNote={paymentRequired && cancelTarget.payment_status === "confirmed" ? "Mark refund as due after cancelling if payment was received." : null}
          onConfirm={() => cancelBooking(cancelTarget.id)}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: colour, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        Coordinator View
      </div>

      {/* EC Notes */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
          {!editNotes && <button onClick={() => setEditNotes(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: colour, fontWeight: 600 }}>Edit</button>}
        </div>
        {editNotes ? (
          <div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: 72, resize: "vertical", marginBottom: 8 }}
              placeholder="Notes visible only to coordinators…" />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditNotes(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveField("coordinator_notes", notes)} disabled={saving}
                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
            </div>
          </div>
        ) : (
          notes
            ? <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, background: colour + "10", borderRadius: 8, padding: "8px 10px" }}>{notes}</div>
            : <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic" }}>No notes yet — tap Edit to add</div>
        )}
      </div>

      {/* Event Description (EC-editable) — hidden for Movies; label is "Event Details" for Books */}
      {!isMovie && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{isBook ? "Event Details" : "Description"}</div>
            {!editDesc && <button onClick={() => setEditDesc(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: colour, fontWeight: 600 }}>Edit</button>}
          </div>
          {editDesc ? (
            <div>
              <textarea value={desc} onChange={e => setDesc(e.target.value)}
                style={{ ...inputStyle, minHeight: 80, resize: "vertical", marginBottom: 8 }}
                placeholder={isBook ? "Event details shown to members…" : "Event description shown to attendees…"} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditDesc(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button onClick={() => saveField("description", desc)} disabled={saving}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
              </div>
            </div>
          ) : (
            desc
              ? <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{desc}</div>
              : <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic" }}>No {isBook ? "event details" : "description"} yet — tap Edit to add</div>
          )}
        </div>
      )}

      {/* Booking Message — not shown for Movies or Books */}
      {!isMovie && !isBook && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Booking Message</div>
            {!editWelcome && <button onClick={() => setEditWelcome(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: colour, fontWeight: 600 }}>Edit</button>}
          </div>
          {editWelcome ? (
            <div>
              <textarea value={welcome} onChange={e => setWelcome(e.target.value)}
                style={{ ...inputStyle, minHeight: 64, resize: "vertical", marginBottom: 8 }}
                placeholder="Shown at top of booking form…" />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditWelcome(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button onClick={() => saveField("welcome_message", welcome)} disabled={saving}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
              </div>
            </div>
          ) : (
            welcome
              ? <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, fontStyle: "italic" }}>"{welcome}"</div>
              : <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic" }}>No welcome message</div>
          )}
        </div>
      )}

      {/* Attendee list */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Attendees ({confirmed.length}{waitlisted.length > 0 ? ` + ${waitlisted.length} waitlist` : ""})
      </div>

      {bookings.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic", marginBottom: 12 }}>No bookings yet</div>
      ) : (() => {
        // Group rows by member so a split booking shows as ONE tile
        const grouped = {}
        for (const b of bookings) {
          const mid = b.members?.id || "unknown"
          if (!grouped[mid]) grouped[mid] = { member: b.members, confirmed: [], waitlist: [] }
          if (b.status === "waitlist") grouped[mid].waitlist.push(b)
          else grouped[mid].confirmed.push(b)
        }
        const attendeeGroups = Object.values(grouped)
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {attendeeGroups.map(({ member, confirmed: confRows, waitlist: waitRows }) => {
              const name = member?.hide_name ? "Resident" : (member?.name || member?.username || "—")
              const confirmedSeats = confRows.reduce((s, b) => s + (b.seats || 1), 0)
              const waitlistSeats  = waitRows.reduce((s, b) => s + (b.seats || 1), 0)
              const isOwnBooking   = member?.id === currentMember?.id
              const hasSplit       = confirmedSeats > 0 && waitlistSeats > 0
              const waitlistOnly   = confirmedSeats === 0 && waitlistSeats > 0
              const borderCol      = waitlistOnly ? "var(--amber)" : "var(--border)"
              // Payment info from first confirmed row (if any)
              const firstConf = confRows[0]
              const isPaid     = firstConf?.payment_status === "confirmed"
              const isRefunded = firstConf?.payment_status === "refunded"
              // All booking IDs for this member (for bulk cancel)
              const allIds = [...confRows, ...waitRows].map(b => b.id)
              return (
                <div key={member?.id || name} style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px",
                  border: `1px solid ${borderCol}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {confirmedSeats > 0 && (
                          <span>{confirmedSeats} seat{confirmedSeats !== 1 ? "s" : ""}</span>
                        )}
                        {waitlistSeats > 0 && (
                          <span style={{ color: "var(--amber-dark)" }}>
                            {hasSplit ? `· +${waitlistSeats} waitlist` : `${waitlistSeats} seat${waitlistSeats !== 1 ? "s" : ""} · Waitlist`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                      {paymentRequired && confirmedSeats > 0 && firstConf && (
                        <button onClick={() => togglePayment(firstConf)}
                          style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 12, border: "none", cursor: "pointer",
                            background: isPaid ? "#dcfce7" : isRefunded ? "#f3f4f6" : "#fef3c7",
                            color: isPaid ? "#15803d" : isRefunded ? "#9ca3af" : "#d97706" }}>
                          {isRefunded ? "Refunded" : isPaid ? "✓ Paid" : "Unpaid"}
                        </button>
                      )}
                      {!isOwnBooking && (
                        <button onClick={() => setCancelTarget({ id: allIds[0], _allIds: allIds, members: member })}
                          style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--danger)", background: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 600 }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {paymentRequired && isPaid && firstConf && (
                    <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                      <button onClick={() => toggleRefund(firstConf)}
                        style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                        Mark refund issued
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Refund Due section — only when payment required and any booking has refund pending */}
      {paymentRequired && bookings.some(b => b.payment_status === "refunded") && (
        <div style={{ background: "var(--amber-light)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--amber)", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber-dark)", marginBottom: 6 }}>⚠️ Refunds Marked</div>
          {bookings.filter(b => b.payment_status === "refunded").map(b => (
            <div key={b.id} style={{ fontSize: 13, color: "var(--amber-dark)", display: "flex", justifyContent: "space-between" }}>
              <span>{b.members?.hide_name ? "Resident" : (b.members?.name || "—")}</span>
              <button onClick={() => toggleRefund(b)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-dim)", textDecoration: "underline" }}>
                Unmark
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Booking Form ──────────────────────────────────────────────────────────────
function BookingSection({ event, onRefresh }) {
  const [seats, setSeats] = useState(1)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [splitOffer, setSplitOffer] = useState(null)
  const [waitlistOffer, setWaitlistOffer] = useState(null)

  const myConfirmed = event.my_bookings?.find(b => b.status === "confirmed")
  const myWaitlist  = event.my_bookings?.find(b => b.status === "waitlist")
  const booked = event.bookings_count || 0
  const max = event.max_seats || 0
  const maxPerBooking   = event.max_seats_per_booking || 4
  const isMovieEvent    = event.hub_type === "movie"
  const availableSeats = Math.max(0, max - booked)

  const [modifySeats, setModifySeats] = useState(
    (myConfirmed?.seats || 0) + (myWaitlist?.seats || 0) || 1
  )
  const [modifying, setModifying] = useState(false)

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function handleBook(acceptSplit = false, acceptWaitlist = false) {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id, seats, accept_split: acceptSplit, accept_waitlist: acceptWaitlist }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Booking failed", "error"); return }
      if (data.status === "split_offer") { setSplitOffer(data); return }
      if (data.status === "waitlist_offer") { setWaitlistOffer(data); return }
      // Success — always clear any pending offer dialogs
      setSplitOffer(null)
      setWaitlistOffer(null)
      if (data.status === "confirmed") showToast(`Booked — ${data.seats} seat${data.seats !== 1 ? "s" : ""} confirmed!`)
      else if (data.status === "waitlist") showToast("Added to waitlist", "warn")
      else if (data.status === "split_confirmed") showToast(`${data.confirmed} confirmed + ${data.waitlisted} waitlisted`, "warn")
      onRefresh()
    } finally { setLoading(false) }
  }

  async function handleModify() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id, seats: modifySeats }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Update failed", "error"); return }
      showToast("Booking updated")
      setModifying(false)
      onRefresh()
    } finally { setLoading(false) }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: event.id }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Cancel failed", "error"); return }
      showToast("Booking cancelled")
      setConfirm(false)
      onRefresh()
    } finally { setLoading(false) }
  }

  const isBookclubEvent = event.hub_type === "bookclub"

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && (
        <ConfirmDialog
          message="This will cancel your booking for this event."
          paymentNote={event.payment_required ? "If you paid, please contact the Event Coordinator to arrange a refund." : null}
          onConfirm={handleCancel}
          onCancel={() => setConfirm(false)}
        />
      )}
      {splitOffer && (
        <SplitDialog offer={splitOffer} onAccept={() => handleBook(true)} onDecline={() => setSplitOffer(null)} />
      )}
      {waitlistOffer && (
        <WaitlistDialog offer={waitlistOffer} onAccept={() => handleBook(false, true)} onDecline={() => setWaitlistOffer(null)} />
      )}

      {!isBookclubEvent && max > 0 && <CapacityBar booked={booked} max={max} waitlist={event.waitlist_count || 0} />}

      {!myConfirmed && !myWaitlist && (
        <div>
          {!isBookclubEvent && availableSeats > 0 && (
            <>
              <SeatSelector value={seats} min={1} max={maxPerBooking} onChange={setSeats} />
              {isMovieEvent && maxPerBooking > 1 && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>Max {maxPerBooking} seats per booking</div>
              )}
            </>
          )}
          <button onClick={() => handleBook()} disabled={loading}
            style={{ width: "100%", padding: "14px 0", background: "var(--amber)", color: "#fff", border: "none",
              borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Booking…" : isBookclubEvent ? "Sign Up" : availableSeats === 0 ? "Join Waitlist" : "Book Now"}
          </button>
          {event.payment_required && (
            <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginTop: 8 }}>
              Payment required to confirm your booking. The coordinator will be in touch.
            </div>
          )}
        </div>
      )}

      {(myConfirmed || myWaitlist) && !modifying && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            {myConfirmed && (
              <StatusPill
                label={event.payment_required
                  ? (myConfirmed.payment_status === "confirmed" ? "✓ Payment Confirmed" : "⏳ Pending Payment")
                  : `✓ ${myConfirmed.seats} seat${myConfirmed.seats !== 1 ? "s" : ""} confirmed`}
                colour={myConfirmed.payment_status === "confirmed" || !event.payment_required ? "var(--green)" : "var(--amber-dark)"}
              />
            )}
            {myWaitlist && <StatusPill label={`⏳ ${myWaitlist.seats} on waitlist`} colour="var(--amber-dark)" />}
          </div>
          {myConfirmed && !isBookclubEvent && (
            <button onClick={() => { setModifySeats((myConfirmed.seats || 1) + (myWaitlist?.seats || 0)); setModifying(true) }}
              style={{ width: "100%", padding: "12px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>
              Modify Seats
            </button>
          )}
          <button onClick={() => setConfirm(true)}
            style={{ width: "100%", padding: "12px 0", background: "transparent", border: "1px solid var(--danger)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--danger)" }}>
            Cancel Booking
          </button>
        </div>
      )}

      {modifying && (
        <div>
          <SeatSelector value={modifySeats} min={1} max={maxPerBooking} onChange={setModifySeats} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModifying(false)}
              style={{ flex: 1, padding: "12px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>Cancel</button>
            <button onClick={handleModify} disabled={loading}
              style={{ flex: 1, padding: "12px 0", background: "var(--amber)", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Login Prompt (for public calendar) ───────────────────────────────────────
// ── Expandable text (book summary — cap at N lines) ──────────────────────────
function ExpandableText({ text, lineHeight = 1.6, fontSize = 13, maxLines = 10 }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const maxH = maxLines * lineHeight * fontSize
  return (
    <div style={{ position: "relative" }}>
      <p style={{
        fontSize, color: "var(--text-dim)", lineHeight, margin: 0,
        maxHeight: expanded ? "none" : maxH,
        overflow: "hidden",
        transition: "max-height 0.3s ease",
      }}>{text}</p>
      {!expanded && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 48, background: "linear-gradient(transparent, var(--surface))",
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4,
        }}>
          <button onClick={() => setExpanded(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              color: "var(--purple)", textDecoration: "underline", fontFamily: "inherit" }}>
            Read more ▾
          </button>
        </div>
      )}
      {expanded && (
        <button onClick={() => setExpanded(false)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
            color: "var(--purple)", textDecoration: "underline", fontFamily: "inherit", marginTop: 4, display: "block" }}>
          Show less ▴
        </button>
      )}
    </div>
  )
}

function LoginPrompt() {
  return (
    <div style={{ background: "var(--amber-light)", borderRadius: 12, padding: 20, textAlign: "center", border: "1px solid var(--amber)" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 6 }}>Login to book</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>
        Residents of Fullerton Cove can register and book events.
      </div>
      <a href="/login" style={{ display: "block", padding: "12px 0", background: "var(--amber)", color: "#fff",
        borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>Sign In</a>
      <a href="/login?register=1" style={{ display: "block", marginTop: 8, padding: "11px 0", background: "transparent",
        color: "var(--amber-dark)", borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none",
        border: "1px solid var(--amber)" }}>Register as a Resident</a>
    </div>
  )
}

// ── EventSlideOut (main export) ───────────────────────────────────────────────
export default function EventSlideOut({ event, onClose, isAuthenticated = true, onRefresh }) {
  const { member, isAdmin } = useUser()
  const [open, setOpen] = useState(false)
  const [coordinators, setCoordinators] = useState([])

  useEffect(() => {
    if (event) {
      setTimeout(() => setOpen(true), 16)
      // Load coordinators for this event
      supabase
        .from("event_coordinators")
        .select("member_id, members!member_id(id, name, username)")
        .eq("event_id", event.id)
        .is("replaced_at", null)
        .order("assigned_at")
        .then(({ data }) => setCoordinators(data || []))
    } else {
      setOpen(false)
      setCoordinators([])
    }
  }, [event])

  if (!event) return null

  const colour = event.is_public === false ? "#bbb" : (HUB_COLOURS[event.hub_type] || "var(--amber)")
  const isPrivate = event.is_public === false

  // Check if current user is a coordinator for this event
  const isEC = member && coordinators.some(ec => ec.member_id === member.id)
  // Also allow admins to see coordinator panel
  const showCoordinatorPanel = isAuthenticated && (isEC || isAdmin)

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, transition: "opacity 0.25s ease" }} />

      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32 }}>

        <div style={{ height: 6, background: colour }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: colour, textTransform: "capitalize" }}>
            {event.hub_type === "bookclub" ? "Book Club" : event.hub_type}
          </div>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
            width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          {/* Movie poster */}
          {event.hub_type === "movie" && event.movie?.poster_url && (
            <img src={event.movie.poster_url} alt={event.movie.title}
              style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12, marginBottom: 14 }} />
          )}
          {/* Book cover */}
          {event.hub_type === "bookclub" && event.book?.cover_url && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <img src={event.book.cover_url} alt={event.book.title}
                style={{ height: 160, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }} />
            </div>
          )}

          {/* Title */}
          <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 4,
            fontStyle: isPrivate ? "italic" : "normal", color: isPrivate ? "#888" : "var(--text)" }}>
            {isPrivate ? "Residents Only" : event.title}
          </h2>

          {/* Date/time */}
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: event.location ? 4 : 10, fontWeight: 500 }}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5}}><CalendarIcon size={13} />{fmtDate(event.event_date)}{event.event_time ? ` at ${fmtTime(event.event_time)}` : ''}</span>
          </div>

          {/* Location — shown for social/outings events */}
          {!isPrivate && event.location && (
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
              📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
            </div>
          )}

          {/* EC names — on one line under location */}
          {!isPrivate && <ECNames coordinators={coordinators} colour={colour} />}

          {isPrivate && (
            <div style={{ background: "#f5f5f5", borderRadius: 10, padding: 14, fontSize: 13, color: "#888", lineHeight: 1.5, marginBottom: 12 }}>
              This is a residents-only event. Login to see full details and book your place.
            </div>
          )}

          {!isPrivate && (
            <>
              {/* Movie-specific */}
              {event.hub_type === "movie" && event.movie && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    {event.movie.rating_imdb && event.movie.imdb_id && (
                      <a href={`https://www.imdb.com/title/${event.movie.imdb_id}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: "#f5c518", fontWeight: 800, textDecoration: "none", fontSize: 14 }}>
                        ⭐ IMDb {event.movie.rating_imdb}
                      </a>
                    )}
                    {event.movie.genre && (
                      <span style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--surface2)", padding: "2px 8px", borderRadius: 4 }}>
                        {event.movie.genre?.split(",")[0]}
                      </span>
                    )}
                    {event.movie.runtime && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>⏱ {event.movie.runtime}</span>}
                  </div>
                  {event.movie.plot && <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>{event.movie.plot}</p>}
                </div>
              )}

              {/* Book-specific */}
              {event.hub_type === "bookclub" && event.book && (
                <div style={{ marginBottom: 14 }}>
                  {event.book.author && <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>by {event.book.author}</div>}
                  {/* Genres */}
                  {event.book.genres && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {event.book.genres.split(",").map(g => g.trim()).filter(Boolean).map(g => (
                        <span key={g} style={{ fontSize: 11, color: "var(--purple)", background: "var(--purple)15", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{g}</span>
                      ))}
                    </div>
                  )}
                  {event.book.rating && event.book.rating_link && (
                    <a href={event.book.rating_link} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#4285f4", fontWeight: 700, textDecoration: "none", fontSize: 14, display: "block", marginBottom: 8 }}>
                      ⭐ {event.book.rating} on Google Books
                    </a>
                  )}
                  {event.book.summary && <ExpandableText text={event.book.summary} maxLines={10} />}
                </div>
              )}

              {/* Social/Outings */}
              {(event.hub_type === "social" || event.hub_type === "outings") && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "inline-block", padding: "4px 12px",
                    background: event.cost > 0 ? "var(--amber-light)" : "var(--green-light, #dcfce7)",
                    color: event.cost > 0 ? "var(--amber-dark)" : "#15803d",
                    borderRadius: 20, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                    {fmtCost(event.cost)}
                  </div>
                  {event.description && <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: "8px 0 0" }}>{event.description}</p>}
                </div>
              )}

              {/* Bus driver — social/outings offsite only */}
              {(event.hub_type === "social" || event.hub_type === "outings") && event.has_bus && event.bus_driver && (
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
                  <BusIcon size={14} /> {event.bus_driver.name || event.bus_driver.username}
                </div>
              )}

              {/* Welcome message */}
              {event.welcome_message && (
                <div style={{ background: colour + "10", borderLeft: `3px solid ${colour}`, borderRadius: "0 8px 8px 0",
                  padding: "10px 12px", fontSize: 13, color: "var(--text)", lineHeight: 1.5, marginBottom: 14 }}>
                  {event.welcome_message}
                </div>
              )}

              {/* Booking section */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 4 }}>
                {isAuthenticated ? (
                  <BookingSection event={event} onRefresh={onRefresh} />
                ) : (
                  <LoginPrompt />
                )}
              </div>

              {/* Coordinator Panel */}
              {showCoordinatorPanel && (
                <CoordinatorPanel event={event} colour={colour} onRefresh={onRefresh} currentMember={member} />
              )}
            </>
          )}

          {isPrivate && !isAuthenticated && <div style={{ marginTop: 8 }}><LoginPrompt /></div>}
        </div>
      </div>
    </>
  )
}
