"use client"
import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { HUB_COLOURS } from "@/lib/navUtils"
import { BusIcon, CalendarIcon } from "@/components/NavIcons"
import { supabase } from "@/lib/supabase"
import { authedFetch } from "@/lib/getAuthToken"
import { useUser } from "@/lib/UserContext"
import RichEditor, { bbToHtml } from "@/components/RichEditor"
import ExpandableText from "@/components/ExpandableText"
import { isPaid as computeIsPaid, isRefunded as computeIsRefunded, isSubmitted as computeIsSubmitted, isPartial as computeIsPartial, sumUnpaidSeats, seatsCost, bookingStatusBadge, balancePhrase, remainingBalance, wholeDollar, paymentSummary, reconciliationIsStale } from "@/lib/payments"
import { byOwnThenName, ordinal } from "@/lib/sortNames"
import { resolveMemberName } from "@/lib/memberName"
import { bookingsClosed, cutoffLabel } from "@/lib/booking"
import { clubCaps, clubColour } from "@/lib/clubs"
import { clubTextOn, clubInk } from "@/lib/clubColours"
import { maxSeatsPerBooking } from "@/lib/modifyBooking"
import { busSeatsUsed } from "@/lib/busSeats"
import { useOwners } from "@/lib/useOwners"

// ── Helpers ───────────────────────────────────────────────────────────────────

// Every resident-picker in this file (walk-up booking, the self-service
// "who else is coming?" party picker) needs to search both people with an
// app login (members) and residents added via Info > Contacts who have
// never signed up (contacts, member_id IS NULL so we don't double-list
// someone who already has a real account). Iain, 2026-07-23: a contact IS a
// resident, not a guest — this directory is the single source both pickers
// search against so that distinction is consistent everywhere.
async function fetchResidentDirectory() {
  const [{ data: members }, { data: contacts }] = await Promise.all([
    supabase.from("members").select("id, name, username, house_number").eq("status", "active").order("name"),
    supabase.from("contacts").select("id, name, house_number").eq("active", true).is("member_id", null).order("name"),
  ])
  const list = [
    ...(members || []).map(m => ({ id: m.id, name: m.name, username: m.username, house_number: m.house_number, type: "member" })),
    ...(contacts || []).map(c => ({ id: c.id, name: c.name, username: null, house_number: c.house_number, type: "contact" })),
  ]
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  return list
}

// Every resident/contact already attached to a live booking for this event
// (as the primary booker or as someone else's named party member) -- used to
// grey out already-booked people in the resident picker instead of letting
// the same person be added to two different bookings for one event (Iain,
// 2026-07-24: Annie Pallot was pickable into both Scampi's party and Iain's
// own party for the same screening). UI-side of the fix; the server enforces
// the same rule authoritatively in lib/attendees.js's validateParty(). RLS
// allows any authenticated member to read bookings/booking_attendees, same
// basis CoordinatorPanel's attendee list already relies on.
async function fetchTakenResidentIds(eventId) {
  const [{ data: bookingRows }, { data: attendeeRows }] = await Promise.all([
    supabase.from("bookings").select("member_id, contact_id").eq("event_id", eventId).neq("status", "cancelled"),
    supabase.from("booking_attendees").select("member_id, contact_id").eq("event_id", eventId),
  ])
  const memberIds = new Set()
  const contactIds = new Set()
  for (const r of [...(bookingRows || []), ...(attendeeRows || [])]) {
    if (r.member_id) memberIds.add(r.member_id)
    if (r.contact_id) contactIds.add(r.contact_id)
  }
  return { memberIds, contactIds }
}

// Renders children into document.body instead of in place. Needed for any
// full-screen overlay (Toast, ConfirmDialog, MenuModal, SplitDialog) used
// inside EventSlideOut's sliding panel: that panel animates with
// `transform: translateX(...)`, and a CSS transform on an ancestor makes it
// the containing block for any descendant `position: fixed` element (this
// is standard CSS behaviour, not a bug in the browser) -- so without a
// portal, these overlays end up positioned relative to the (scrollable,
// often-scrolled) panel content instead of the actual viewport, which is
// what caused Cancel Booking's confirm dialog to render off-screen instead
// of over the tapped row (reported by Iain, 2026-07-14, reproduced on an
// attendee list long enough to need scrolling).
function Portal({ children }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

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
    <div style={{ display: "inline-block", padding: "6px 16px", background: bg || colour + "20", color: clubInk(colour),
      borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${colour}` }}>{label}</div>
  )
}

// Styled toggle switch (matches Social's/ClubHome's Toggle component exactly)
// -- used here instead of a raw <input type="checkbox"> for the three
// Community Bus opt-in controls (initial booking, party row, Modify), which
// Iain flagged as inconsistent with the rest of the app's UI Standards
// (no native form controls). Kept local to this file since EventSlideOut's
// booking panel and party row don't currently receive a hub/club accent
// colour prop -- threading one through every call site for a single toggle
// wasn't worth the blast radius, so this defaults to the amber used
// elsewhere in this same panel (the Book Now / Modify Seats buttons).
function Toggle({ value, onChange, label, colour = "var(--amber)", disabled = false }) {
  return (
    <div onClick={() => !disabled && onChange(!value)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.65rem 0.85rem", background: "var(--surface2)",
      borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", userSelect: "none",
      border: "1px solid var(--border)", opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? colour : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  )
}

function Toast({ msg, type }) {
  if (!msg) return null
  const bg = type === "error" ? "var(--danger)" : type === "warn" ? "var(--amber-dark)" : "#15803d"
  return (
    <Portal>
      <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
        background: bg, color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center" }}>{msg}</div>
    </Portal>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel, paymentNote, confirming }) {
  // confirming: true while the cancel request is in flight. Without this,
  // the "Yes, cancel" button gave zero feedback on tap -- on a slow request
  // (cold serverless start, or an event with several waitlisted attendees
  // to promote) it looked unresponsive, which is exactly what prompted
  // multiple taps (Iain, 2026-07-14). Both buttons now disable and the
  // confirm button relabels to make the wait visible instead of silent.
  return (
    <Portal>
      <div onClick={() => { if (!confirming) onCancel() }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500,
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
            <button onClick={onCancel} disabled={confirming} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: confirming ? "default" : "pointer", color: "var(--text)", opacity: confirming ? 0.5 : 1 }}>Keep it</button>
            <button onClick={onConfirm} disabled={confirming} style={{ flex: 1, padding: "11px 0", background: "var(--danger)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: confirming ? "default" : "pointer", color: "#fff", opacity: confirming ? 0.7 : 1 }}>{confirming ? "Cancelling…" : "Yes, cancel"}</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function MenuModal({ event, colour, onClose }) {
  const isPdf = event.menu_type === "file" && /\.pdf($|\?)/i.test(event.menu_url || "")
  const isImageFile = event.menu_type === "file" && !isPdf

  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 480,
          maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Menu</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "var(--text-dim)" }}>×</button>
          </div>
          <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
            {event.menu_type === "text" && (
              <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: bbToHtml(event.menu_text, colour) }} />
            )}
            {isPdf && (
              <iframe src={event.menu_url} title="Menu" style={{ width: "100%", height: "60vh", border: "none", borderRadius: 8 }} />
            )}
            {isImageFile && (
              <img src={event.menu_url} alt="Menu" style={{ width: "100%", borderRadius: 8, display: "block" }} />
            )}
          </div>
          {event.menu_type === "file" && event.menu_url && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <a href={event.menu_url} download={event.menu_file_name || "menu"} target="_blank" rel="noreferrer"
                style={{ display: "block", textAlign: "center", padding: "10px", borderRadius: 10, background: colour, color: clubTextOn(colour), fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}

function SplitDialog({ offer, onAccept, onDecline }) {
  const allWaitlist = offer.confirmed === 0
  const title = allWaitlist ? "No seats available" : "Not enough seats"
  const acceptLabel = allWaitlist ? "Join waitlist" : "Confirm booking"

  let body
  if (allWaitlist) {
    body = <>
      There are no confirmed seats available right now. All{" "}
      <strong>{offer.waitlisted}</strong> seat{offer.waitlisted !== 1 ? "s" : ""} will
      go on the waitlist. You&apos;ll be confirmed automatically as seats free up.
    </>
  } else {
    body = <>
      Only <strong>{offer.confirmed}</strong> seat{offer.confirmed !== 1 ? "s" : ""} are
      available right now. <strong>{offer.confirmed}</strong> seat{offer.confirmed !== 1 ? "s" : ""} will
      be confirmed and <strong>{offer.waitlisted}</strong> seat{offer.waitlisted !== 1 ? "s" : ""} will
      go on the waitlist.
    </>
  }

  return (
    <Portal>
      <div onClick={onDecline} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {/* role=dialog + a stable test id so a test can scope to THIS dialog.
            Without it, getByRole('button', {name:'Join waitlist'}) also matched
            the Movies Home tile, which reads "Full · Join waitlist →" whenever
            the next screening is full — a real strict-mode collision that only
            appeared once a screening actually filled up. */}
        <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
          aria-label={title} data-testid="split-offer-dialog"
          style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16, lineHeight: 1.5 }}>{body}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onDecline} style={{ flex: 1, padding: "11px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>No thanks</button>
            <button onClick={onAccept} style={{ flex: 1, padding: "11px 0", background: "var(--amber)", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff" }}>{acceptLabel}</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ── EC names display ──────────────────────────────────────────────────────────
function ECNames({ coordinators, colour }) {
  if (!coordinators?.length) return null
  return (
    <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span>👤</span>
      <span>Coordinator{coordinators.length > 1 ? "s" : ""}:</span>
      {coordinators.map((ec, i) => (
        <span key={ec.member_id} style={{ fontWeight: 600, color: "var(--text)" }}>
          {ec.members?.name || ec.members?.username}{i < coordinators.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  )
}

// ── Coordinator Panel ─────────────────────────────────────────────────────────
function CoordinatorPanel({ event, colour, onRefresh, currentMember, refreshKey = 0 }) {
  const [data,        setData]        = useState(null)
  const [partyByOwner, setPartyByOwner] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState(null)
  const [toast,       setToast]       = useState(null)
  const [editNotes,   setEditNotes]   = useState(false)
  const [editDesc,    setEditDesc]    = useState(false)
  const [editWelcome, setEditWelcome] = useState(false)
  const [notes,       setNotes]       = useState("")
  const [desc,        setDesc]        = useState("")
  const [welcome,     setWelcome]     = useState("")
  const [saving,        setSaving]        = useState(false)
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelling,    setCancelling]    = useState(false)
  const [closingOut,    setClosingOut]    = useState(false)
  // Inline Paid/Unpaid/Partial recording (2026-08-20) -- this panel's
  // payment badge was made read-only on 2026-07-12 on the assumption every
  // paid event has Social's own inline "Scheduled tile" accordion as the
  // one editable surface for it -- true for Social, but Clubs and Movies
  // have NO other attendee view at all, so for those two hubs there was
  // never actually any way to mark a booking paid. Restoring an editable
  // control here specifically, since it's the only surface those hubs have.
  const [payTogglingId, setPayTogglingId] = useState(null)
  const [payRecordingId, setPayRecordingId] = useState(null)
  const [payRecordAmount, setPayRecordAmount] = useState("")
  const [payRecordNote, setPayRecordNote] = useState("")
  const [payResetConfirmId, setPayResetConfirmId] = useState(null)
  // Modify an existing booking's seat count on the resident's behalf
  // (2026-08-08, Iain: "there needs to be a cancel AND modify option").
  // Same rule set as a resident modifying their own booking -- see
  // lib/modifyBooking.js, shared with PATCH /api/bookings.
  const [modifyTarget,    setModifyTarget]    = useState(null)
  const [modifySeats,     setModifySeats]     = useState(1)
  const [modifyParty,     setModifyParty]     = useState([])
  const [modifyNameParty, setModifyNameParty] = useState(false)
  const [modifyTaken,     setModifyTaken]     = useState({ memberIds: new Set(), contactIds: new Set() })
  const [modifySubmitting, setModifySubmitting] = useState(false)
  // Add Walk-up Booking (2026-07-13) — for residents who don't use the app
  const [showAddBooking,      setShowAddBooking]      = useState(false)
  const [allResidents,        setAllResidents]        = useState([])
  const [residentQuery,       setResidentQuery]       = useState("")
  const [residentResults,     setResidentResults]     = useState([])
  const [selectedResident,    setSelectedResident]    = useState(null)
  const [addSeats,            setAddSeats]            = useState(1)
  const [addMarkPaid,         setAddMarkPaid]         = useState(false)
  const [addSubmitting,       setAddSubmitting]       = useState(false)
  const [insufficientCapacity, setInsufficientCapacity] = useState(null)
  // Name the extra seat(s) on a walk-up booking (2026-07-23, Iain: "let Lyn
  // make a walk-up booking for 2 seats and set Geoff as the second seat").
  // Optional, off by default -- an EC can still book N anonymous seats
  // (pre-existing behaviour) without naming who they're for.
  const [addNameParty,        setAddNameParty]        = useState(false)
  const [addParty,            setAddParty]            = useState([])
  const allowGuests = !!event.allow_nonresident_guests
  const isMovie  = event.hub_type === "movie"
  const isBook   = clubCaps(event.club).hasBooks
  const isSocial = event.hub_type === "social"

  const inputStyle = { width: "100%", padding: "0.6rem 0.8rem", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)", fontSize: "0.88rem", boxSizing: "border-box", fontFamily: "inherit" }

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Reconciliation "Close Out" (2026-08-19 -- ported from Social's own
  // inline card, see app/(app)/social/events/page.js, so any hub/club
  // using this shared panel gets the same reconciliation behaviour rather
  // than a third copy of the same logic). Re-runnable, never a lock --
  // stamps payments_reconciled_at/_by and reminds whoever is still unpaid
  // right now.
  async function handleCloseOutPayments() {
    if (closingOut) return
    setClosingOut(true)
    try {
      const res = await authedFetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, action: "close_out_payments" }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error || "Could not close out", "error"); return }
      showToast(d.reminded > 0 ? `Reminded ${d.reminded} unpaid attendee${d.reminded !== 1 ? "s" : ""}` : "Reviewed — nothing unpaid")
      load()
    } finally {
      setClosingOut(false)
    }
  }

  async function load() {
    setLoading(true)
    setApiError(null)
    try {
      const res = await authedFetch(`/api/coordinator?event_id=${event.id}`)
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

  useEffect(() => { load() }, [event.id, refreshKey])

  // Named additional attendees (workstream A) for every booking on this event,
  // grouped by the owner who booked them. RLS allows any authenticated member
  // to read these; this EC/admin panel bypasses masking same as the main
  // attendee tiles, via resolveMemberName's canManage (2026-08-15 -- this
  // used to show member.name directly, missing display_name entirely).
  useEffect(() => {
    supabase.from("booking_attendees")
      .select("owner_id, owner_contact_id, member_id, contact_id, guest_name, is_bus_passenger, member:members!member_id(name, display_name, hide_name, username), contact:contacts!contact_id(name)")
      .eq("event_id", event.id)
      .then(({ data: rows }) => {
        const map = {}
        for (const r of rows || []) {
          // Composite key matches the m:/c: keys the grouped attendee tiles
          // build below, since a walk-up booking's party is owned by a
          // contact (owner_contact_id), not a member (owner_id) -- migration
          // 061, 2026-07-23.
          const key = r.owner_id ? `m:${r.owner_id}` : `c:${r.owner_contact_id}`
          ;(map[key] = map[key] || []).push(
            r.member_id ? { label: resolveMemberName(r.member, { canManage: true, fallback: r.member?.username || "Resident" }), guest: false, bus: !!r.is_bus_passenger }
              : r.contact_id ? { label: r.contact?.name || "Resident", guest: false, bus: !!r.is_bus_passenger }
              : { label: r.guest_name, guest: true, bus: !!r.is_bus_passenger }
          )
        }
        setPartyByOwner(map)
      })
  }, [event.id])

  useEffect(() => {
    if (showAddBooking && allResidents.length === 0) {
      fetchResidentDirectory().then(setAllResidents)
    }
  }, [showAddBooking])

  // Already-booked residents/contacts for this event (see fetchTakenResidentIds
  // above) so a walk-up booking can't silently double up someone who's
  // already in another booking's party.
  const [taken, setTaken] = useState({ memberIds: new Set(), contactIds: new Set() })
  useEffect(() => {
    if (showAddBooking) fetchTakenResidentIds(event.id).then(setTaken)
  }, [showAddBooking, event.id, refreshKey])

  useEffect(() => { setInsufficientCapacity(null) }, [addSeats, selectedResident])

  useEffect(() => {
    const need = Math.max(0, addSeats - 1)
    setAddParty(prev => {
      const copy = prev.slice(0, need)
      while (copy.length < need) copy.push({ kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "" })
      return copy
    })
  }, [addSeats])
  useEffect(() => { setAddNameParty(false); setAddParty([]) }, [selectedResident])

  const addPartyNeed = Math.max(0, addSeats - 1)
  // Mirrors BookingSection's requireNaming/partyValid (below) -- when the
  // event has require_attendee_names on, a walk-up booking must name every
  // extra seat the same as a self-service one; the "Skip naming" escape
  // hatch only exists when naming is optional. Bug (Iain, 2026-08-04): this
  // used to ignore event.require_attendee_names entirely, so the toggle had
  // no effect on walk-up bookings even though the server-side check
  // (app/api/coordinator/route.js -> validateParty) was already correct --
  // the "Add Booking" button just silently allowed a submit that the server
  // would reject with the party unnamed, rather than blocking it up front.
  const requireAddNaming = !!event.require_attendee_names
  const isAddRowFilled = p => !!(p.member_id || p.contact_id || (allowGuests && p.guest_name && p.guest_name.trim()))
  const addPartyValid = requireAddNaming
    ? (addParty.length === addPartyNeed && addParty.every(isAddRowFilled))
    : (!addNameParty || (addParty.length === addPartyNeed && addParty.every(isAddRowFilled)))
  const addPartyToAttendees = (arr) => arr.map(p => ({
    ...(p.member_id ? { member_id: p.member_id } : p.contact_id ? { contact_id: p.contact_id } : { guest_name: (p.guest_name || "").trim() }),
    // Community bus (2026-08-19): this EC panel doesn't expose a bus
    // checkbox (self-service only, per Iain's ask) -- but syncAttendees does
    // a full delete+insert of an owner's party on every write, so if a
    // resident's own booking has bus-flagged attendees and an EC then uses
    // Modify (submitModify, below, shares this same function) without this
    // field, their bus reservation would silently vanish. openModify seeds
    // is_bus_passenger from the real row so this just passes it through
    // unchanged; a brand-new walk-up booking (add_booking) has nothing to
    // preserve, so this is always false there.
    is_bus_passenger: !!p.is_bus_passenger,
  }))

  async function patchAction(body) {
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, ...body }),
    })
    // Surface the server's real reason (e.g. the cancel-blocked-by-an-
    // unresolved-payment-claim guard, 2026-08-12) instead of a generic
    // failure -- same fix as PR #62's authedFetch migration for ClubHome,
    // just not yet applied to this panel's own patchAction wrapper.
    let error = null
    if (!res.ok) {
      try { error = (await res.json())?.error || null } catch { /* non-JSON error body */ }
    }
    return { ok: res.ok, error }
  }

  async function toggleRefund(booking) {
    // Renamed from "set_refund" 2026-08-11 -- see lib/payments.js's
    // isRefundIssued/isRefundPending for the unified refund_due/
    // refund_paid_at ledger this now writes to (covers overpayment refunds
    // on active bookings too, not just a cancelled-and-was-paid booking).
    const isIssued = !!booking.refund_paid_at || booking.payment_status === "refunded"
    const { ok, error } = await patchAction({ action: "mark_refund_paid", booking_id: booking.id, refunded: !isIssued })
    if (ok) { showToast(isIssued ? "Refund mark removed" : "Refund marked"); load(); onRefresh() }
    else showToast(error || "Failed", "error")
  }

  async function toggleHasBook(booking) {
    const { ok, error } = await patchAction({ action: "set_has_book", booking_id: booking.id, has_book: !booking.has_book })
    if (ok) { showToast(booking.has_book ? "Marked as returned" : "Book marked as given out"); load(); onRefresh() }
    else showToast(error || "Failed to update", "error")
  }

  async function toggleNameHidden(booking) {
    const { ok, error } = await patchAction({ action: "set_name_hidden", booking_id: booking.id, name_hidden: !booking.name_hidden })
    if (ok) { showToast(booking.name_hidden ? "Name shown again" : "Name hidden"); load(); onRefresh() }
    else showToast(error || "Failed to update", "error")
  }

  // Record/toggle a payment (2026-08-20) -- same /api/coordinator
  // "set_payment" action Social's own inline toggle uses (see
  // app/(app)/social/events/page.js's handleTogglePayment); the server
  // derives partial/confirmed from the amount, this never sends a status
  // directly. A plain "reset to unpaid" sends no amount at all.
  async function handlePaymentToggle(booking, amount, note) {
    if (payTogglingId) return
    setPayTogglingId(booking.id)
    const isSettled = booking.payment_status === "confirmed" || booking.payment_status === "partial"
    const next = isSettled ? "pending" : "confirmed"
    const { ok, error } = await patchAction({
      action: "set_payment", booking_id: booking.id, payment_status: next,
      ...(next === "confirmed" ? { amount: amount === "" || amount == null ? undefined : amount, note: note || undefined } : {}),
    })
    setPayTogglingId(null)
    if (ok) { showToast(next === "confirmed" ? "Payment recorded" : "Marked as unpaid"); load(); onRefresh() }
    else showToast(error || "Failed to update payment", "error")
  }

  async function cancelBooking(bookingId) {
    if (cancelling) return // ignore repeat taps while a request is already in flight
    setCancelling(true)
    try {
      const { ok, error } = await patchAction({ action: "cancel_booking", booking_id: bookingId })
      if (ok) {
        // If member had a split booking, cancel remaining rows too. This used
        // to reference an undefined `token` here (patchAction() fetches its
        // own token internally and never exposed it to this scope) -- would
        // throw and abort before the toast/refresh below ever ran, but only
        // for a split (confirmed+waitlist) booking, so it went unnoticed
        // until one actually occurred. Fixed to reuse patchAction() like
        // every other action in this panel, instead of a bare fetch.
        const extraIds = cancelTarget._allIds?.slice(1) || []
        for (const extraId of extraIds) {
          await patchAction({ action: "cancel_booking", booking_id: extraId })
        }
        showToast("Booking cancelled"); setCancelTarget(null); load(); onRefresh()
      }
      else showToast(error || "Failed to cancel", "error")
    } finally {
      setCancelling(false)
    }
  }

  // Seed the Modify editor from this resident's current booking(s) + named
  // party, mirroring how self-service Modify (BookingSection, below) seeds
  // itself from myAttendees -- fetched fresh here rather than reused from
  // partyByOwner above, since that map only carries display labels, not the
  // member_id/contact_id a PartyPicker needs to prefill correctly.
  async function openModify(group) {
    const ownerId = group.member?.id || null
    const ownerContactId = !ownerId ? (group.contact?.id || null) : null
    if (!ownerId && !ownerContactId) return
    const currentTotal = group.confirmedSeats + group.waitlistSeats
    setModifyNameParty(false)
    setModifySeats(currentTotal || 1)
    if (allResidents.length === 0) fetchResidentDirectory().then(setAllResidents)
    const [{ data: attendeeRows }, takenIds] = await Promise.all([
      supabase.from("booking_attendees")
        .select("member_id, contact_id, guest_name, is_bus_passenger, member:members!member_id(name), contact:contacts!contact_id(name)")
        .eq("event_id", event.id)
        .eq(ownerId ? "owner_id" : "owner_contact_id", ownerId || ownerContactId),
      fetchTakenResidentIds(event.id, { excludeOwnerId: ownerId, excludeOwnerContactId: ownerContactId }),
    ])
    setModifyTaken(takenIds)
    // is_bus_passenger carried through unset in the UI (this panel has no bus
    // checkbox) purely so addPartyToAttendees round-trips it unchanged on
    // Save -- see the comment there for why dropping it would be a silent
    // data-loss bug, not just a missing feature.
    setModifyParty((attendeeRows || []).map(a => (a.member_id
      ? { kind: "resident", member_id: a.member_id, contact_id: null, member_name: a.member?.name || "Resident", guest_name: "", is_bus_passenger: !!a.is_bus_passenger }
      : a.contact_id
      ? { kind: "resident", member_id: null, contact_id: a.contact_id, member_name: a.contact?.name || "Resident", guest_name: "", is_bus_passenger: !!a.is_bus_passenger }
      : { kind: "guest", member_id: null, contact_id: null, member_name: "", guest_name: a.guest_name || "", is_bus_passenger: !!a.is_bus_passenger })))
    setModifyTarget({
      ownerId, ownerContactId, currentTotal,
      name: group.member?.name || group.member?.username || group.contact?.name || "Resident",
      alreadySplit: group.waitlistSeats > 0,
    })
  }

  function closeModify() {
    setModifyTarget(null); setModifyParty([]); setModifyNameParty(false)
  }

  function changeModifySeats(next) {
    setModifySeats(next)
    const need = Math.max(0, next - 1)
    setModifyParty(prev => {
      const copy = prev.slice(0, need)
      while (copy.length < need) copy.push({ kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "" })
      return copy
    })
  }

  async function submitModify() {
    if (!modifyTarget || modifySubmitting) return
    setModifySubmitting(true)
    try {
      // Direct fetch (not patchAction) so a specific server reason -- e.g.
      // "already split, cancel and rebook instead" -- reaches the toast
      // instead of being collapsed to a generic "Failed" (same reasoning as
      // submitAddBooking, just below).
      const res = await authedFetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id, action: "modify_booking",
          ...(modifyTarget.ownerId ? { member_id: modifyTarget.ownerId } : { contact_id: modifyTarget.ownerContactId }),
          seats: modifySeats,
          attendees: addPartyToAttendees(modifyParty),
        }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Update failed", "error"); return }
      showToast(`${modifyTarget.name}'s booking updated`)
      closeModify(); load(); onRefresh()
    } finally {
      setModifySubmitting(false)
    }
  }

  async function submitAddBooking(forceWaitlist = false) {
    if (!selectedResident) return
    if (!addPartyValid) return
    setAddSubmitting(true)
    try {
      const res = await authedFetch("/api/coordinator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id, action: "add_booking",
          ...(selectedResident.type === "contact" ? { contact_id: selectedResident.id } : { member_id: selectedResident.id }),
          seats: addSeats, mark_paid: addMarkPaid,
          ...((requireAddNaming || addNameParty) ? { attendees: addPartyToAttendees(addParty) } : {}),
          ...(forceWaitlist ? { force_status: "waitlist" } : {}),
        }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Failed to add booking", "error"); return }
      if (d.status === "insufficient_capacity") { setInsufficientCapacity({ available: d.available }); return }
      showToast(`${selectedResident.name} added${d.status === "waitlist" ? " to waitlist" : ""}`)
      setSelectedResident(null); setResidentQuery(""); setResidentResults([])
      setAddSeats(1); setInsufficientCapacity(null); setShowAddBooking(false)
      load(); onRefresh()
    } finally { setAddSubmitting(false) }
  }

  async function saveField(field, value) {
    setSaving(true)
    const { ok } = await patchAction({ action: "update_event", [field]: value })
    setSaving(false)
    if (ok) {
      showToast("Saved")
      if (field === "coordinator_notes") setEditNotes(false)
      if (field === "description") setEditDesc(false)
      if (field === "welcome_message") setEditWelcome(false)
      load()
      // description/welcome_message are shown outside this panel too (EventCard,
      // BookingSection) — refresh the parent's copy, not just this panel's own.
      onRefresh()
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
      <button onClick={load} style={{ marginTop: 8, fontSize: 12, color: clubInk(colour), background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
    </div>
  )

  const bookings     = data?.bookings || []
  const maxPerBooking = maxSeatsPerBooking(event)
  const bookedMemberIds  = new Set(bookings.map(b => b.members?.id).filter(Boolean))
  const bookedContactIds = new Set(bookings.map(b => b.contacts?.id).filter(Boolean))
  const refundPending = data?.refund_pending || []
  const refundIssued  = data?.refund_issued || []
  const confirmed = bookings.filter(b => b.status === "confirmed")
  const waitlisted = bookings.filter(b => b.status === "waitlist")
  const eventCost = data?.cost ? parseFloat(data.cost) : null
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
          message={`Cancel booking for ${cancelTarget.members?.name || cancelTarget.members?.username || cancelTarget.contacts?.name}?`}
          paymentNote={paymentRequired && computeIsPaid(cancelTarget) ? "Mark refund as due after cancelling if payment was received." : null}
          onConfirm={() => cancelBooking(cancelTarget.id)}
          onCancel={() => { if (!cancelling) setCancelTarget(null) }}
          confirming={cancelling}
        />
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: clubInk(colour), textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        Coordinator View
      </div>

      {/* Community bus (2026-08-19): transparency for the driver -- a running
          count here, the actual names live per-attendee below (🚌 markers). */}
      {!!event.has_bus && (() => {
        const busCount = confirmed.filter(b => b.bus_passenger).length
          + Object.values(partyByOwner).flat().filter(p => p.bus).length
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
            <BusIcon size={13} />
            <span>Bus: {busCount}{event.bus_max_seats != null ? ` / ${event.bus_max_seats}` : ""} seat{busCount !== 1 ? "s" : ""} taken</span>
          </div>
        )
      })()}

      {/* EC Notes */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
          {!editNotes && <button onClick={() => setEditNotes(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: clubInk(colour), fontWeight: 600 }}>Edit</button>}
        </div>
        {editNotes ? (
          <div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: 72, resize: "vertical", marginBottom: 8 }}
              placeholder="Notes visible only to coordinators…" />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditNotes(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveField("coordinator_notes", notes)} disabled={saving}
                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: clubTextOn(colour), cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
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
            {!editDesc && <button onClick={() => setEditDesc(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: clubInk(colour), fontWeight: 600 }}>Edit</button>}
          </div>
          {editDesc ? (
            <div>
              <RichEditor
                initialValue={desc}
                hubColour={colour}
                bg="card"
                onChange={html => setDesc(html)}
                placeholder={isBook ? "Event details shown to members…" : "Event description shown to attendees…"}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setEditDesc(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button onClick={() => saveField("description", desc)} disabled={saving}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: clubTextOn(colour), cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
              </div>
            </div>
          ) : (
            desc
              ? <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: bbToHtml(desc, colour) }} />
              : <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic" }}>No {isBook ? "event details" : "description"} yet — tap Edit to add</div>
          )}
        </div>
      )}

      {/* Booking Message — not shown for Movies or Books */}
      {!isMovie && !isBook && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Booking Message</div>
            {!editWelcome && <button onClick={() => setEditWelcome(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: clubInk(colour), fontWeight: 600 }}>Edit</button>}
          </div>
          {editWelcome ? (
            <div>
              <textarea value={welcome} onChange={e => setWelcome(e.target.value)}
                style={{ ...inputStyle, minHeight: 64, resize: "vertical", marginBottom: 8 }}
                placeholder="Shown at top of booking form…" />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditWelcome(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button onClick={() => saveField("welcome_message", welcome)} disabled={saving}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: clubTextOn(colour), cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
              </div>
            </div>
          ) : (
            welcome
              ? <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, fontStyle: "italic" }}>"{welcome}"</div>
              : <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic" }}>No welcome message</div>
          )}
        </div>
      )}

      {/* Reconciliation Summary + Close Out (2026-08-19 -- ported from
          Social's own inline card, see app/(app)/social/events/page.js, so
          this shared panel gives every hub/club the same reconciliation
          behaviour rather than a third duplicate copy of it). */}
      {paymentRequired && eventCost && (() => {
        const summary = paymentSummary(confirmed, { payment_required: paymentRequired, cost: data?.cost }, refundPending)
        if (!summary) return null
        const isStale = data?.payments_reconciled_at && reconciliationIsStale({ payments_reconciled_at: data.payments_reconciled_at }, bookings)
        return (
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: data?.payments_reconciled_at || summary.unpaidCount > 0 || summary.refundsDueCount > 0 ? 8 : 0 }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Expected <strong style={{ color: "var(--text)" }}>${summary.expectedTotal.toFixed(2)}</strong></span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Collected <strong style={{ color: "var(--green)" }}>${summary.collectedTotal.toFixed(2)}</strong></span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Outstanding <strong style={{ color: summary.outstandingTotal > 0 ? "var(--amber-dark)" : "var(--text)" }}>${summary.outstandingTotal.toFixed(2)}</strong></span>
              {summary.refundsDueCount > 0 && (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Refunds due <strong style={{ color: "#92400e" }}>${summary.refundsDueTotal.toFixed(2)}</strong></span>
              )}
            </div>
            {data?.payments_reconciled_at && (
              <div style={{ fontSize: 11, color: isStale ? "var(--amber-dark)" : "var(--text-dim)", marginBottom: summary.unpaidCount > 0 ? 8 : 0 }}>
                Last reviewed {new Date(data.payments_reconciled_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                {data.reconciled_by_member && ` by ${data.reconciled_by_member.name || data.reconciled_by_member.username}`}
                {isStale && <strong> — new activity since, worth another look</strong>}
              </div>
            )}
            {summary.submittedCount > 0 && (
              <div style={{ fontSize: 11, color: "#0f766e", marginBottom: 8 }}>
                🧾 {summary.submittedCount} of these marked payment submitted — check and confirm below
              </div>
            )}
            {summary.partialCount > 0 && (
              <div style={{ fontSize: 11, color: "#075985", marginBottom: 8 }}>
                {summary.partialCount} partial payment{summary.partialCount !== 1 ? "s" : ""} (${summary.partialTotal.toFixed(2)} received so far) — still short of the full amount
              </div>
            )}
            {summary.unpaidCount > 0 && (
              <button
                disabled={closingOut}
                onClick={handleCloseOutPayments}
                style={{
                  width: "100%", padding: "8px", borderRadius: 8, border: "1px solid var(--amber)",
                  background: "var(--amber)15", color: "var(--amber-dark)", fontSize: 12, fontWeight: 700,
                  cursor: closingOut ? "default" : "pointer", fontFamily: "inherit", opacity: closingOut ? 0.6 : 1,
                }}>{closingOut ? "Closing out…" : `Close Out — remind ${summary.unpaidCount} unpaid`}</button>
            )}
          </div>
        )
      })()}

      {/* Attendee list */}
      {(() => {
        const totalSeats = confirmed.reduce((s, b) => s + (b.seats || 1), 0)
        const unpaidSeats = sumUnpaidSeats(confirmed, { payment_required: paymentRequired })
        return (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Attendees — {totalSeats} seat{totalSeats !== 1 ? "s" : ""} taken
            {paymentRequired && unpaidSeats > 0 && (
              <span style={{ color: "var(--amber-dark)", fontWeight: 700 }}> · {unpaidSeats} unpaid</span>
            )}
            {waitlisted.length > 0 && (
              <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{" "}+ {waitlisted.length} waitlist</span>
            )}
          </div>
        )
      })()}

      {/* Add walk-up booking — for residents who don't use the app (2026-07-13) */}
      <div style={{ marginBottom: 12 }}>
        {!showAddBooking ? (
          <button onClick={() => setShowAddBooking(true)}
            style={{ fontSize: 13, fontWeight: 600, color: clubInk(colour), background: "none", border: `1px dashed ${colour}`,
              borderRadius: 10, padding: "8px 12px", cursor: "pointer", width: "100%" }}>
            + Add Walk-up Booking
          </button>
        ) : (
          <div style={{ background: colour + "0d", border: `1px solid ${colour}40`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: clubInk(colour), textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Add Walk-up Booking
              </div>
              <button onClick={() => {
                  setShowAddBooking(false); setSelectedResident(null)
                  setResidentQuery(""); setResidentResults([]); setInsufficientCapacity(null)
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-dim)" }}>✕</button>
            </div>

            {!selectedResident ? (
              <div style={{ position: "relative" }}>
                <input value={residentQuery}
                  onChange={e => {
                    const q = e.target.value
                    setResidentQuery(q)
                    const norm = q.trim().toLowerCase()
                    setResidentResults(norm.length < 2 ? [] : allResidents.filter(m =>
                      (m.name?.toLowerCase().includes(norm) || m.username?.toLowerCase().includes(norm)) &&
                      !(m.type === "contact" ? bookedContactIds.has(m.id) : bookedMemberIds.has(m.id))
                    ))
                  }}
                  placeholder="Search resident name (2+ letters)…"
                  style={inputStyle} />
                {residentResults.length > 0 && (
                  <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
                    {residentResults.slice(0, 8).map(m => (
                      <div key={m.id}
                        onClick={() => { setSelectedResident(m); setResidentResults([]); setResidentQuery("") }}
                        style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                        {m.name}{m.house_number ? ` (#${m.house_number})` : ""}{m.username && m.username !== m.name ? ` (${m.username})` : ""}{m.type === "contact" ? " · no app account" : ""}
                      </div>
                    ))}
                  </div>
                )}
                {residentQuery.trim().length >= 2 && residentResults.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>No match, or already booked on this event</div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedResident.name}</span>
                  <button onClick={() => setSelectedResident(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-dim)", textDecoration: "underline" }}>Change</button>
                </div>

                {/* Cap read from the event's own max_seats_per_booking (2026-08-23
                    fix) -- this was the one seat-count entry point PR #69
                    (2026-08-08) missed when it fixed the other four hardcoded-4
                    sites. A coordinator could set this stepper up to 4 regardless
                    of the event's real cap, the naming picker below honoured
                    THAT count, but the server (add_booking, app/api/coordinator/
                    route.js) silently clamped seats to the event's actual cap via
                    maxSeatsPerBooking() -- so a walk-up booking for an event
                    capped below 4 could ask for e.g. 2 named attendees while the
                    server only expected 1, rejecting a fully-named submission
                    with a confusing "Please name all 1 additional attendee"
                    error. Confirmed against a real production event ("The Way",
                    max_seats_per_booking=2) that reproduced exactly this. */}
                {!isBook && <SeatSelector value={addSeats} min={1} max={maxPerBooking} onChange={setAddSeats} />}

                {!isBook && addSeats > 1 && (
                  <div style={{ marginBottom: 12 }}>
                    {requireAddNaming ? (
                      // Naming is mandatory for this event -- no "skip" escape hatch,
                      // the picker is always shown and Add Booking stays disabled
                      // (addPartyValid, above) until every extra seat is named.
                      <PartyPicker count={addSeats - 1} allowGuests={allowGuests} members={allResidents}
                        excludeIds={selectedResident ? [selectedResident.id] : []}
                        value={addParty} onChange={setAddParty} taken={taken} required />
                    ) : !addNameParty ? (
                      <button type="button" onClick={() => setAddNameParty(true)}
                        style={{ fontSize: 12, fontWeight: 600, color: clubInk(colour), background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                        + Name who the other {addSeats - 1 === 1 ? "seat is" : `${addSeats - 1} seats are`} for
                      </button>
                    ) : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Who else is coming?</span>
                          <button type="button" onClick={() => { setAddNameParty(false); setAddParty([]) }}
                            style={{ fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                            Skip naming
                          </button>
                        </div>
                        <PartyPicker count={addSeats - 1} allowGuests={allowGuests} members={allResidents}
                          excludeIds={selectedResident ? [selectedResident.id] : []}
                          value={addParty} onChange={setAddParty} taken={taken} required={false} />
                      </>
                    )}
                  </div>
                )}

                {paymentRequired && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {[{ v: false, label: "Unpaid", colour: "var(--amber-dark)", fill: "var(--amber)" },
                      { v: true, label: "Paid (cash)", colour: "var(--green)", fill: "var(--green)" }].map(opt => (
                      <button key={String(opt.v)} onClick={() => setAddMarkPaid(opt.v)}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                          border: `1px solid ${addMarkPaid === opt.v ? opt.fill : "var(--border)"}`,
                          background: addMarkPaid === opt.v ? opt.fill : "var(--surface)",
                          color: addMarkPaid === opt.v ? "#fff" : opt.colour }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {insufficientCapacity && (
                  <div style={{ fontSize: 12, color: "var(--amber-dark)", background: "var(--amber-light)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                    Only {insufficientCapacity.available} seat{insufficientCapacity.available !== 1 ? "s" : ""} left.
                    <button onClick={() => submitAddBooking(true)} disabled={addSubmitting}
                      style={{ display: "block", marginTop: 6, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: 12, color: "var(--amber-dark)", fontWeight: 700 }}>
                      Add to waitlist instead
                    </button>
                  </div>
                )}

                <button onClick={() => submitAddBooking(false)} disabled={addSubmitting || !addPartyValid}
                  style={{ width: "100%", padding: "10px 0", background: colour, color: clubTextOn(colour), border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 700, cursor: (addSubmitting || !addPartyValid) ? "not-allowed" : "pointer", opacity: (addSubmitting || !addPartyValid) ? 0.7 : 1 }}>
                  {addSubmitting ? "Adding…" : "Add Booking"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {bookings.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)", fontStyle: "italic", marginBottom: 12 }}>No bookings yet</div>
      ) : (() => {
        // Group rows by resident (member OR contact) so a split booking shows as ONE tile
        const grouped = {}
        for (const b of bookings) {
          const key = b.members?.id ? `m:${b.members.id}` : b.contacts?.id ? `c:${b.contacts.id}` : "unknown"
          if (!grouped[key]) grouped[key] = { member: b.members || null, contact: b.contacts || null, confirmed: [], waitlist: [] }
          if (b.status === "waitlist") grouped[key].waitlist.push(b)
          else grouped[key].confirmed.push(b)
        }

        // Waitlist queue position (Iain, 2026-08-17: "the waitlisted number
        // for a booking needs to be visible to the Admin/Owner/EC view") --
        // ranked by booked_at ascending across every waitlist row on this
        // event, same FIFO convention /api/screenings already uses to tell a
        // resident their own position. Computed explicitly here rather than
        // relied on from `bookings`' existing order, so this stays correct
        // even if that query's ordering ever changes.
        const waitlistOrder = bookings.filter(b => b.status === "waitlist")
          .slice().sort((a, b) => new Date(a.booked_at) - new Date(b.booked_at))
        const waitlistPositionById = new Map(waitlistOrder.map((b, i) => [b.id, i + 1]))

        // Own row always pinned to the top — consistent with every other attendee
        // list (Movies/Social inline lists, Book Club's own attendees list).
        // Then: confirmed (and split confirmed+waitlist) attendees A-Z as
        // before, followed by waitlist-only attendees in QUEUE order rather
        // than A-Z (Iain, 2026-08-17) -- someone 4th in line reading above
        // someone 1st in line just because their name comes earlier
        // alphabetically was confusing for admins deciding who to contact
        // first as seats free up.
        const attendeeGroups = Object.values(grouped)
          .map(g => {
            const waitlistOnly = g.confirmed.length === 0 && g.waitlist.length > 0
            const waitlistPosition = waitlistOnly
              ? Math.min(...g.waitlist.map(b => waitlistPositionById.get(b.id) ?? Infinity))
              : null
            return { ...g, waitlistOnly, waitlistPosition }
          })
          .sort((a, b) => {
            const isOwnA = a.member?.id === currentMember?.id, isOwnB = b.member?.id === currentMember?.id
            if (isOwnA !== isOwnB) return isOwnA ? -1 : 1
            if (a.waitlistOnly !== b.waitlistOnly) return a.waitlistOnly ? 1 : -1
            if (a.waitlistOnly && b.waitlistOnly) return a.waitlistPosition - b.waitlistPosition
            return byOwnThenName(false, false,
              a.member?.display_name || a.member?.name || a.contact?.name,
              b.member?.display_name || b.member?.name || b.contact?.name,
            )
          })
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {attendeeGroups.map(({ member, contact, confirmed: confRows, waitlist: waitRows, waitlistOnly: isWaitlistOnly, waitlistPosition }) => {
              const isOwnBooking   = member?.id === currentMember?.id
              // This whole panel is already admin/EC-only (showCoordinatorPanel), so
              // masking is bypassed here same as Contacts -- but which name is PRIMARY
              // was never revisited after Display Name shipped (this block predates it,
              // 2026-08-04). Iain's rule (2026-08-15, same as the Contacts list): admins
              // see Display Name front-and-centre, with Real Name revealed underneath in
              // smaller text -- not Real Name as the primary label. Flag Private members
              // with a (P) marker so admins/ECs still know at a glance. Own row always
              // reads "You". Contacts have no login/display_name concept -- always their
              // one real name.
              const isPrivate = !!member?.hide_name
              const name = isOwnBooking ? "You"
                : member ? resolveMemberName(member, { canManage: true, fallback: member?.username || contact?.name || "—" })
                : (contact?.name || "—")
              const realName = (!isOwnBooking && member?.display_name && member.display_name !== member.name) ? member.name : null
              const confirmedSeats = confRows.reduce((s, b) => s + (b.seats || 1), 0)
              const waitlistSeats  = waitRows.reduce((s, b) => s + (b.seats || 1), 0)
              const hasSplit       = confirmedSeats > 0 && waitlistSeats > 0
              const waitlistOnly   = confirmedSeats === 0 && waitlistSeats > 0
              const borderCol      = isOwnBooking ? colour : (waitlistOnly ? "var(--amber)" : "var(--border)")
              // Payment info from first confirmed row (if any)
              const firstConf = confRows[0]
              const isPaid     = computeIsPaid(firstConf)
              const isPartial  = computeIsPartial(firstConf, event)
              const isRefunded = computeIsRefunded(firstConf)
              // All booking IDs for this member (for bulk cancel)
              const allIds = [...confRows, ...waitRows].map(b => b.id)
              // Book Club: has_book / name_hidden live on the booking row itself —
              // one member = one row here (no split-seat concept for Book Club).
              const primaryRow = confRows[0] || waitRows[0]
              const hasBook    = !!primaryRow?.has_book
              const isHidden   = !!primaryRow?.name_hidden
              return (
                <div key={member?.id || contact?.id || name} style={{ background: isOwnBooking ? colour + "10" : "var(--surface2)", borderRadius: 10, padding: "10px 12px",
                  border: `${isOwnBooking ? 2 : 1}px solid ${borderCol}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: isOwnBooking ? colour : "var(--text)" }}>
                        {isWaitlistOnly && waitlistPosition && (
                          <span style={{ color: "var(--amber-dark)", marginRight: 5 }}>({ordinal(waitlistPosition)})</span>
                        )}
                        {name}
                        {isPrivate && !isOwnBooking && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", marginLeft: 5 }}>(P)</span>}
                        {!!firstConf?.bus_passenger && <span title="Riding the bus" style={{ marginLeft: 5 }}><BusIcon size={11} /></span>}
                      </div>
                      {realName && (
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{realName}</div>
                      )}
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
                      {(() => {
                        const ownerKey = member?.id ? `m:${member.id}` : contact?.id ? `c:${contact.id}` : null
                        const party = ownerKey ? (partyByOwner[ownerKey] || []) : []
                        return party.length > 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.5 }}>
                            With: {party.map((p, i) => (
                              <span key={i}>{i > 0 ? ", " : ""}{p.label}{p.guest ? " (guest)" : ""}{p.bus ? " 🚌" : ""}</span>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                      {paymentRequired && confirmedSeats > 0 && firstConf && computeIsSubmitted(firstConf) && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 10,
                          background: "#f0fdfa", color: "#0f766e", border: "1px solid #99f6e4" }}>🧾 Submitted</span>
                      )}
                      {paymentRequired && confirmedSeats > 0 && firstConf && !isRefunded && (() => {
                        // Editable again (2026-08-20) -- see the note above
                        // handlePaymentToggle: this is the ONLY attendee view
                        // Clubs/Movies have, so a read-only badge here left
                        // those two hubs with no way to mark a booking paid
                        // at all.
                        const pending = payTogglingId === firstConf.id
                        return (
                          <button
                            disabled={pending}
                            onClick={() => {
                              const owed = seatsCost(event, confirmedSeats)
                              const bal = remainingBalance(firstConf, event, confirmedSeats)
                              setPayRecordingId(firstConf.id)
                              setPayRecordAmount(String(Math.round(bal != null ? bal : owed)))
                              setPayRecordNote("")
                              setPayResetConfirmId(null)
                            }}
                            role="switch" aria-checked={isPaid}
                            aria-label={isPaid || isPartial ? "Adjust recorded payment" : "Record a payment"}
                            style={{
                              fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 12,
                              background: isPaid ? "#16a34a20" : isPartial ? "#0369a120" : "var(--surface)",
                              color: isPaid ? "#16a34a" : isPartial ? "#0369a1" : "var(--text-dim)",
                              border: `1px solid ${isPaid ? "#16a34a" : isPartial ? "#0369a1" : "var(--border)"}`,
                              cursor: pending ? "default" : "pointer", opacity: pending ? 0.55 : 1, fontFamily: "inherit",
                            }}>{isPaid ? "Paid" : isPartial ? `Partial · ${wholeDollar(firstConf?.amount_paid)}` : "Unpaid"}</button>
                        )
                      })()}
                      {paymentRequired && confirmedSeats > 0 && firstConf && isRefunded && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 12,
                          background: "#f3f4f6", color: "#9ca3af" }}>Refunded</span>
                      )}
                    </div>
                  </div>
                  {paymentRequired && firstConf && payRecordingId === firstConf.id && (() => {
                    const bal = remainingBalance(firstConf, event, confirmedSeats)
                    const enteredAmt = payRecordAmount === "" ? null : (parseFloat(payRecordAmount) || 0)
                    const willComplete = enteredAmt !== null && bal != null && Math.round(enteredAmt) === Math.round(bal)
                    // 2026-08-24 fix (BUG-024): amount != balance requires a
                    // comment before Save can run -- that block already
                    // existed via the `disabled` attribute, but the button
                    // gave no visual or interactive cue it was blocked, so
                    // an EC clicking a short/over payment saw nothing happen
                    // with no explanation. commentNeeded/saveBlocked below
                    // drive real disabled styling, a hover tooltip, and a
                    // persistent inline warning + red textarea border.
                    const commentNeeded = !willComplete
                    const pending = payTogglingId === firstConf.id
                    const saveBlocked = commentNeeded && !payRecordNote.trim()
                    const saveDisabled = pending || saveBlocked
                    return (
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, padding: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Amount received</span>
                          <input type="number" min="0" step="1" value={payRecordAmount} onChange={e => setPayRecordAmount(e.target.value)}
                            style={{ width: 80, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
                          {bal != null && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>of {wholeDollar(bal)} balance</span>}
                        </div>
                        <textarea placeholder={willComplete ? "Comment (optional)" : "Comment (required if amount doesn't complete the balance)"}
                          value={payRecordNote} onChange={e => setPayRecordNote(e.target.value)} rows={2}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: `1px solid ${saveBlocked ? "var(--red, #dc2626)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: 11, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                        {saveBlocked && (
                          <div style={{ fontSize: 11, color: "var(--red, #dc2626)", fontWeight: 600 }}>
                            ⚠ Add a comment before saving — the amount doesn't complete the balance.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setPayRecordingId(null); setPayResetConfirmId(null) }}
                            style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                          <button
                            disabled={saveDisabled}
                            title={saveBlocked ? "Add a comment before saving — the amount doesn't complete the balance." : undefined}
                            onClick={() => {
                              if (saveBlocked) return
                              handlePaymentToggle(firstConf, payRecordAmount, payRecordNote); setPayRecordingId(null)
                            }}
                            style={{ flex: 1, padding: 6, borderRadius: 8, border: "none", background: saveDisabled ? "var(--surface2)" : colour, color: saveDisabled ? "var(--text-dim)" : clubTextOn(colour), cursor: saveDisabled ? "not-allowed" : "pointer", opacity: saveDisabled ? 0.6 : 1, fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>Save</button>
                        </div>
                        {(isPaid || isPartial) && (
                          payResetConfirmId === firstConf.id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, color: "var(--amber-dark)", flex: 1 }}>Clear the {wholeDollar(firstConf.amount_paid)} on file and mark unpaid?</span>
                              <button onClick={() => setPayResetConfirmId(null)} style={{ fontSize: 11, background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>No</button>
                              <button onClick={() => { handlePaymentToggle(firstConf); setPayResetConfirmId(null); setPayRecordingId(null) }}
                                style={{ fontSize: 11, fontWeight: 700, background: "none", border: "none", color: "var(--amber-dark)", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>Yes, reset</button>
                            </div>
                          ) : (
                            <button onClick={() => setPayResetConfirmId(firstConf.id)}
                              style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", textDecoration: "underline" }}>
                              Reset to unpaid
                            </button>
                          )
                        )}
                      </div>
                    )
                  })()}
                  {isBook && primaryRow && (
                    <div style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: hasBook ? colour : "var(--text-dim)" }}>{hasBook ? "Has Book" : "No Book"}</span>
                        <div onClick={() => toggleHasBook(primaryRow)} role="switch" aria-checked={hasBook}
                          title={hasBook ? "Mark as returned" : "Mark book as given out"}
                          style={{ position: "relative", width: 40, height: 22, borderRadius: 11,
                            background: hasBook ? colour : "var(--border)",
                            cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                          <span style={{ position: "absolute", top: 3, left: hasBook ? 20 : 3, width: 16, height: 16,
                            borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                        </div>
                      </div>
                      <button onClick={() => toggleNameHidden(primaryRow)}
                        style={{ fontSize: 11, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
                          color: isHidden ? colour : "var(--text-dim)", textDecoration: "underline", padding: 0 }}>
                        {isHidden ? "Name hidden — show" : "Hide name"}
                      </button>
                    </div>
                  )}
                  {!isOwnBooking && (
                    <div style={{ textAlign: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "center" }}>
                      {!isBook && (
                        <button onClick={() => openModify({ member, contact, confirmedSeats, waitlistSeats })}
                          style={{ fontSize: 12, padding: "5px 20px", borderRadius: 8, border: `1px solid ${colour}`, background: "none", color: clubInk(colour), cursor: "pointer", fontWeight: 600 }}>
                          Modify
                        </button>
                      )}
                      <button onClick={() => setCancelTarget({ id: allIds[0], _allIds: allIds, members: member })}
                        style={{ fontSize: 12, padding: "5px 20px", borderRadius: 8, border: "1px solid var(--danger)", background: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 600 }}>
                        Cancel Booking
                      </button>
                    </div>
                  )}
                  {modifyTarget && (modifyTarget.ownerId ? modifyTarget.ownerId === member?.id : modifyTarget.ownerContactId === contact?.id) && (() => {
                    const seatMax = modifyTarget.alreadySplit ? modifyTarget.currentTotal : maxPerBooking
                    const need = Math.max(0, modifySeats - 1)
                    const modifyPartyValid = requireAddNaming
                      ? (modifyParty.length === need && modifyParty.every(isAddRowFilled))
                      : (!modifyNameParty || (modifyParty.length === need && modifyParty.every(isAddRowFilled)))
                    return (
                      <div style={{ marginTop: 10, background: colour + "0d", border: `1px dashed ${colour}80`, borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: clubInk(colour), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                          Modify {modifyTarget.name}'s Booking
                        </div>
                        <SeatSelector value={modifySeats} min={1} max={seatMax} onChange={changeModifySeats} />
                        {modifyTarget.alreadySplit && (
                          <div style={{ fontSize: 12, color: "var(--amber-dark)", background: "var(--amber-light)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                            This booking already has seats on the waitlist, so it can't be increased any further — that's why seats caps out at {modifyTarget.currentTotal} here. Cancel it and rebook instead if more are needed.
                          </div>
                        )}
                        {need > 0 && (
                          requireAddNaming ? (
                            <PartyPicker count={need} allowGuests={allowGuests} members={allResidents}
                              excludeIds={modifyTarget.ownerId ? [modifyTarget.ownerId] : modifyTarget.ownerContactId ? [modifyTarget.ownerContactId] : []}
                              value={modifyParty} onChange={setModifyParty} taken={modifyTaken} required />
                          ) : !modifyNameParty ? (
                            <button type="button" onClick={() => setModifyNameParty(true)}
                              style={{ fontSize: 12, fontWeight: 600, color: clubInk(colour), background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, marginBottom: 8 }}>
                              + Name who the other {need === 1 ? "seat is" : `${need} seats are`} for
                            </button>
                          ) : (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Who else is coming?</span>
                                <button type="button" onClick={() => { setModifyNameParty(false); setModifyParty([]) }}
                                  style={{ fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                                  Skip naming
                                </button>
                              </div>
                              <PartyPicker count={need} allowGuests={allowGuests} members={allResidents}
                                excludeIds={modifyTarget.ownerId ? [modifyTarget.ownerId] : modifyTarget.ownerContactId ? [modifyTarget.ownerContactId] : []}
                                value={modifyParty} onChange={setModifyParty} taken={modifyTaken} required={false} />
                            </>
                          )
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button onClick={closeModify} disabled={modifySubmitting}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            Cancel
                          </button>
                          <button onClick={submitModify} disabled={modifySubmitting || (need > 0 && !modifyPartyValid)}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: colour, color: clubTextOn(colour),
                              cursor: (modifySubmitting || (need > 0 && !modifyPartyValid)) ? "not-allowed" : "pointer",
                              opacity: (modifySubmitting || (need > 0 && !modifyPartyValid)) ? 0.7 : 1, fontSize: 13, fontWeight: 700 }}>
                            {modifySubmitting ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Book Club: cancelled attendees whose book is still out — cancelling attendance
          doesn't return the physical book, so these stay visible until an EC/admin clears them. */}
      {isBook && (data?.cancelled_book_out?.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber-dark)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Book Not Returned — Cancelled Attendee{data.cancelled_book_out.length > 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.cancelled_book_out.map(b => {
              const isOwn     = b.members?.id === currentMember?.id
              const isPrivate = !!(b.members?.hide_name || b.name_hidden)
              const bname = isOwn ? "You" : (b.members?.name || b.members?.username || b.contacts?.name || "—")
              return (
                <div key={b.id} style={{ background: isOwn ? colour + "10" : "var(--surface2)", borderRadius: 10, padding: "10px 12px", border: `${isOwn ? 2 : 1}px solid ${isOwn ? colour : "var(--amber)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: isOwn ? colour : "var(--text)" }}>
                        {bname}
                        {isPrivate && !isOwn && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", marginLeft: 5 }}>(P)</span>}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 6 }}>· Cancelled, book still out</span>
                    </div>
                    <button onClick={() => toggleHasBook(b)}
                      style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${colour}`, background: "none", color: clubInk(colour), cursor: "pointer", whiteSpace: "nowrap" }}>
                      Mark Returned
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Refunds Pending — cancelled bookings that were paid, need refund */}
      {paymentRequired && refundPending.length > 0 && (
        <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 12px", border: "1px solid #d97706", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>⚠️ Refunds Due ({refundPending.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {refundPending.map(b => {
              const isOwn     = b.members?.id === currentMember?.id
              const isPrivate = !!b.members?.hide_name
              const name = isOwn ? "You" : (b.members?.name || b.members?.username || b.contacts?.name || "—")
              const seats = b.seats || 1
              const total = eventCost ? `$${(eventCost * seats).toFixed(2)}` : null
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                      {name}
                      {isPrivate && !isOwn && <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", opacity: 0.7, marginLeft: 5 }}>(P)</span>}
                    </span>
                    <span style={{ fontSize: 11, color: "#d97706", marginLeft: 6 }}>{seats} seat{seats !== 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                  </div>
                  <button onClick={() => toggleRefund(b)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, border: "1px solid #d97706", background: "none", color: "#d97706", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Mark Refunded
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Refunds Issued — cancelled bookings where refund was given */}
      {paymentRequired && refundIssued.length > 0 && (
        <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 8 }}>✓ Refunds Issued ({refundIssued.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {refundIssued.map(b => {
              const isOwn     = b.members?.id === currentMember?.id
              const isPrivate = !!b.members?.hide_name
              const name = isOwn ? "You" : (b.members?.name || b.members?.username || b.contacts?.name || "—")
              const seats = b.seats || 1
              const total = eventCost ? `$${(eventCost * seats).toFixed(2)}` : null
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: isOwn ? 700 : 400 }}>
                      {name}
                      {isPrivate && !isOwn && <span style={{ fontWeight: 700, marginLeft: 5 }}>(P)</span>}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 6 }}>{seats} seat{seats !== 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                  </div>
                  <button onClick={() => toggleRefund(b)}
                    style={{ fontSize: 10, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Unmark
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bring-a-dish picker (scope §6) ───────────────────────────────────────────
// Mandatory for the booker, optional for their guests (Iain's ruling).
function BringPicker({ cats, categoryId, note, onChange, colour, required, label }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "var(--danger)" }}> *</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {cats.map(c => {
          const on = categoryId === c.id
          return (
            <button key={c.id} type="button" onClick={() => onChange(on ? { category_id: null, note: "" } : { category_id: c.id, note })}
              style={{ borderRadius: 14, padding: "0.25rem 0.7rem", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour : "var(--surface)", color: on ? "#fff" : "var(--text-dim)" }}>
              {c.label}
            </button>
          )
        })}
      </div>
      {/* Details stay locked until a category is chosen (Iain 2026-07-18) —
          a note without a category isn't meaningful. */}
      <input value={note || ""} disabled={!categoryId}
        onChange={e => onChange({ category_id: categoryId, note: e.target.value })}
        placeholder={categoryId ? "What exactly? (optional, e.g. Pavlova)" : "Choose an option above first"}
        style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)",
          background: categoryId ? "var(--surface)" : "var(--surface2)",
          color: "var(--text)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit",
          cursor: categoryId ? "text" : "not-allowed", opacity: categoryId ? 1 : 0.6 }} />
    </div>
  )
}

// ── Party picker (workstream A) ───────────────────────────────────────────────
// Collects the (seats - 1) additional attendees for a multi-seat booking. Each
// is a resident (searchable, 2-char min per UI standards) or, only when the
// event allows it, a named non-resident guest.
function PartyRow({ index, row, allowGuests, members, excludeIds, onChange, bringCats = [], taken, bus }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const kind = row.kind || "resident"
  const q = query.trim().toLowerCase()
  // `members` here is the merged resident directory (app-login members +
  // Contacts-hub residents with no login) — a contact is picked exactly like
  // a member, just carries contact_id instead of member_id.
  const isTaken = (m) => !!taken && (m.type === "contact" ? taken.contactIds.has(m.id) : taken.memberIds.has(m.id))
  const results = q.length < 2 ? [] : members
    .filter(m => !excludeIds.includes(m.id) && (m.name || "").toLowerCase().includes(q))
    .sort((a, b) => Number(isTaken(a)) - Number(isTaken(b)))
    .slice(0, 6)
  const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }
  const emptyRow = { kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "" }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
      {allowGuests && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[["guest", "Guest"], ["resident", "Resident"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => onChange({ ...row, ...emptyRow, kind: k })}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                border: `1px solid ${kind === k ? "var(--amber)" : "var(--border)"}`, background: kind === k ? "var(--amber)" : "var(--surface2)",
                color: kind === k ? "#fff" : "var(--text)", fontWeight: kind === k ? 700 : 500 }}>{label}</button>
          ))}
        </div>
      )}
      {kind === "resident" ? (
        (row.member_id || row.contact_id) ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "var(--text)" }}>{row.member_name}</span>
            <button type="button" onClick={() => { onChange({ ...row, ...emptyRow }); setQuery("") }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Change</button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <input value={query} placeholder={`Search resident for seat ${index + 2}…`}
              onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} style={inputStyle} />
            {open && results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                {results.map(m => {
                  const takenAlready = isTaken(m)
                  return (
                    <button key={m.id} type="button" disabled={takenAlready}
                      onClick={() => {
                        if (takenAlready) return
                        onChange({ ...row, kind: "resident",
                          member_id: m.type === "contact" ? null : m.id,
                          contact_id: m.type === "contact" ? m.id : null,
                          member_name: m.name, guest_name: "" })
                        setOpen(false); setQuery("")
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 11px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: takenAlready ? "default" : "pointer", fontSize: 14, color: "var(--text)", fontFamily: "inherit", opacity: takenAlready ? 0.45 : 1 }}>
                      {m.name}{m.house_number ? ` (#${m.house_number})` : ""}{m.type === "contact" ? " · no app account" : ""}{takenAlready ? " · Already booked" : ""}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      ) : (
        <input value={row.guest_name} placeholder={`Guest name for seat ${index + 2}…`}
          onChange={e => onChange({ ...row, kind: "guest", member_id: null, contact_id: null, member_name: "", guest_name: e.target.value })} style={inputStyle} />
      )}
      {bringCats.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <BringPicker cats={bringCats} categoryId={row.bring_category_id} note={row.bring_note}
            colour="var(--amber)" label="Bringing (optional)"
            onChange={({ category_id, note }) => onChange({ ...row, bring_category_id: category_id, bring_note: note })} />
        </div>
      )}
      {/* Community bus (2026-08-19): only shown for offsite events with a bus.
          Riding the bus forces this row to be named regardless of whether the
          event otherwise requires attendee names -- lib/attendees.js enforces
          this server-side; the row is already a resident/guest name-or-nothing
          picker above, so the requirement is just "pick someone" once ticked. */}
      {bus?.enabled && (
        <div style={{ marginTop: 8 }}>
          <Toggle value={!!row.is_bus_passenger} disabled={bus.full && !row.is_bus_passenger}
            onChange={v => onChange({ ...row, is_bus_passenger: v })}
            label="🚌 Riding the bus" />
          {bus.full && !row.is_bus_passenger && (
            <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 2 }}>Bus is full</div>
          )}
        </div>
      )}
    </div>
  )
}

function PartyPicker({ count, allowGuests, members, excludeIds, value, onChange, bringCats = [], taken, required = true, bus }) {
  const rows = []
  for (let i = 0; i < count; i++) rows.push(value[i] || { kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "" })
  const chosen = value.filter(v => v?.member_id || v?.contact_id).map(v => v.member_id || v.contact_id)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "8px 0 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
        {required
          ? `Who else is coming? Please name the other ${count === 1 ? "attendee" : `${count} attendees`}.`
          : `Who else is coming? Naming them is optional — leave any seat blank if you'd rather not say.`}
      </div>
      {rows.map((row, i) => (
        <PartyRow key={i} index={i} row={row} allowGuests={allowGuests} members={members}
          bringCats={bringCats} taken={taken} bus={bus}
          excludeIds={[...excludeIds, ...chosen.filter(id => id !== (row.member_id || row.contact_id))]}
          onChange={next => { const copy = value.slice(); copy[i] = next; onChange(copy) }} />
      ))}
    </div>
  )
}

// ── Booking Form ──────────────────────────────────────────────────────────────
function BookingSection({ event, onRefresh, onClose }) {
  const [seats, setSeats] = useState(1)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Self-report amount/comment (2026-08-11 follow-up) -- a resident needs a
  // way to say HOW MUCH they've paid, not just tap a blind "I've Paid"
  // button, especially once they're already Partial and are now reporting
  // the remaining balance. Pre-fills with the full amount owed (the common
  // case: "I've now paid it all off"), editable down if they've only added
  // a further partial amount.
  const [showSelfReport, setShowSelfReport] = useState(false)
  const [selfAmount, setSelfAmount] = useState("")
  const [selfNote, setSelfNote] = useState("")
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [splitOffer, setSplitOffer] = useState(null)

  // Multi-attendee (workstream A). Party = the named additional attendees for a
  // >1-seat booking; sized to seats-1. members powers the resident search;
  // myAttendees prefills the party when modifying an existing booking.
  const { member: me } = useUser()
  const allowGuests = !!event.allow_nonresident_guests
  const [members, setMembers] = useState([])
  const [party, setParty] = useState([])
  const [myAttendees, setMyAttendees] = useState([])
  // Community bus (2026-08-19): the booker's own seat lives on the booking
  // row itself (bus_passenger), same reasoning as myBring below -- the
  // booker isn't a booking_attendees row, so their own choice can't live
  // there. Named party members' choices live on booking_attendees
  // (is_bus_passenger), threaded through party/modParty rows below.
  const [myWantsBus, setMyWantsBus] = useState(false)
  const [modWantsBus, setModWantsBus] = useState(false)
  const [myInitialBusUsage, setMyInitialBusUsage] = useState(0)
  // Bring-a-dish (reworked 2026-08-07, Iain): applicable to THIS event only
  // when it actually has bring categories chosen -- club.bring_enabled is
  // just the club-level capability switch, it no longer implies every event
  // in the club uses it. Whether picking one is mandatory or just offered is
  // the event's own bring_required column, a separate choice.
  const bringApplicable = Array.isArray(event.bring_category_ids) && event.bring_category_ids.length > 0
  const bringRequired = bringApplicable && !!event.bring_required
  const [bringCats, setBringCats] = useState([])
  const [myBring, setMyBring] = useState({ category_id: null, note: "" })
  useEffect(() => {
    if (!bringApplicable || !event.club?.id) { setBringCats([]); return }
    supabase.from("club_bring_categories").select("id, label, sort")
      .eq("club_id", event.club.id).order("sort")
      .then(({ data }) => {
        const all = data || []
        const allowed = event.bring_category_ids
        let list = all.filter(c => allowed.includes(c.id))
        // Defensive fallback (Iain hit this live 2026-07-24, Sydney Harbour
        // Night): if an event's chosen categories are all now stale (e.g.
        // Admin > Clubs re-saved the club and regenerated fresh row ids for
        // unchanged categories -- fixed at the source in ClubForm, but any
        // event snapshot taken before that fix still has orphaned ids),
        // showing NOTHING would silently disable Book Now for everyone with
        // nothing they can do about it. Showing every current category is
        // the safer failure -- the original narrowing choice is
        // unrecoverable once the ids are gone, but nobody should be blocked
        // from booking because of it.
        if (list.length === 0 && all.length > 0) list = all
        setBringCats(list)
      })
  }, [bringApplicable, event.club?.id, event.id])

  useEffect(() => {
    if (event.hub_type !== "bookclub" && (event.max_seats_per_booking || 1) > 1 && members.length === 0) {
      fetchResidentDirectory().then(setMembers)
    }
  }, [event.id])

  // Already-booked residents/contacts for this event, so the party picker
  // can grey them out instead of allowing the same person into two
  // different bookings (see fetchTakenResidentIds above). Subtracts the
  // current user's OWN existing party (myAttendees) so re-picking the exact
  // person already in their own booking -- e.g. tapping Change then
  // re-selecting the same name -- doesn't get wrongly greyed out as "taken
  // by someone else" when they're only taken by this same booking.
  const [takenRaw, setTakenRaw] = useState({ memberIds: new Set(), contactIds: new Set() })
  useEffect(() => {
    fetchTakenResidentIds(event.id).then(setTakenRaw)
  }, [event.id])
  const taken = useMemo(() => {
    const memberIds = new Set(takenRaw.memberIds)
    const contactIds = new Set(takenRaw.contactIds)
    for (const a of myAttendees) {
      if (a.member_id) memberIds.delete(a.member_id)
      if (a.contact_id) contactIds.delete(a.contact_id)
    }
    return { memberIds, contactIds }
  }, [takenRaw, myAttendees])

  useEffect(() => {
    const need = Math.max(0, seats - 1)
    setParty(prev => {
      const copy = prev.slice(0, need)
      while (copy.length < need) copy.push({ kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "" })
      return copy
    })
  }, [seats])

  useEffect(() => {
    if (!me?.id) return
    Promise.all([
      supabase.from("booking_attendees")
        .select("member_id, contact_id, guest_name, bring_category_id, bring_note, is_bus_passenger, member:members!member_id(name), contact:contacts!contact_id(name)")
        .eq("event_id", event.id).eq("owner_id", me.id),
      // Prefill the booker's own dish AND bus seat so both show in the manage
      // view and aren't lost when they Modify (Iain 2026-07-18, extended for
      // the bus 2026-08-19).
      supabase.from("bookings").select("bring_category_id, bring_note, bus_passenger")
        .eq("event_id", event.id).eq("member_id", me.id).eq("status", "confirmed").maybeSingle(),
    ]).then(([{ data: attendeeData }, { data: bookingData }]) => {
      const rows = attendeeData || []
      setMyAttendees(rows)
      if (bookingData?.bring_category_id) setMyBring({ category_id: bookingData.bring_category_id, note: bookingData.bring_note || "" })
      setMyWantsBus(!!bookingData?.bus_passenger)
      // Snapshot of what "me" was already contributing to the bus count at
      // load time, for hubs that only give BookingSection a pre-aggregated
      // total (event.bus_seats_used, see below) rather than the full
      // bookings/booking_attendees arrays -- without this, a resident's own
      // existing bus seat(s) would double-count against the shared total
      // when computing how many are left for THEM to still request.
      setMyInitialBusUsage((bookingData?.bus_passenger ? 1 : 0) + rows.filter(a => a.is_bus_passenger).length)
    })
  }, [event.id, me?.id])

  // Naming extra seats used to be mandatory on every multi-seat booking.
  // Iain, 2026-07-25: default is now the opposite -- naming is optional
  // unless the event explicitly requires it (events.require_attendee_names).
  // Server-side (lib/attendees.js's validateParty) is authoritative; this
  // mirrors it client-side just to gate the button the same way.
  const requireNaming = !!event.require_attendee_names
  const isRowFilled = p => !!(p.member_id || p.contact_id || (allowGuests && p.guest_name && p.guest_name.trim()))
  const partyNeed = Math.max(0, seats - 1)
  const partyValid = !requireNaming || (party.length === partyNeed && party.every(isRowFilled))
  const bringValid = !bringRequired || !!myBring.category_id
  const partyToAttendees = (arr) => arr.map(p => ({
    ...(p.member_id ? { member_id: p.member_id } : p.contact_id ? { contact_id: p.contact_id } : { guest_name: (p.guest_name || "").trim() }),
    bring_category_id: p.bring_category_id || null,
    bring_note: p.bring_note || null,
    is_bus_passenger: !!p.is_bus_passenger,
  }))

  // Community bus (2026-08-19): capacity is independent of the event's own
  // seats and has explicitly NO waitlist -- the control just disables once
  // full. busUsedByOthers excludes this member's own current usage (same
  // "othersConfirmed" pattern the seat cap already uses) so a resident
  // re-submitting their own unchanged bus seat, or opening Modify, isn't
  // blocked by themselves. Mirrors the server-side check in
  // app/api/bookings/route.js exactly, so a resident should rarely actually
  // hit the server's rejection -- this is what disables the checkbox first.
  const busEnabled = !!event.has_bus
  // Two shapes of input, depending on the hub page that built this `event`
  // object: Social/Show Time/Book Club hydrate full `bookings` +
  // `booking_attendees` arrays (so the exact "others" set can be computed
  // directly); Clubs' list view only ever built a pre-aggregated
  // `bookings_count` for ordinary seats (never the full arrays), so it
  // supplies a matching pre-aggregated `event.bus_seats_used` instead --
  // myInitialBusUsage (snapshotted above) is subtracted back out of that
  // total to get "everyone but me", the same number the full-array path
  // computes directly.
  const busUsedByOthers = Array.isArray(event.bookings) || Array.isArray(event.booking_attendees)
    ? busSeatsUsed({
        bookings: (event.bookings || []).filter(b => b.member_id !== me?.id),
        attendees: (event.booking_attendees || []).filter(a => a.owner_id !== me?.id),
      })
    : Math.max(0, (event.bus_seats_used || 0) - myInitialBusUsage)
  const busRemainingBase = event.bus_max_seats != null ? Math.max(0, event.bus_max_seats - busUsedByOthers) : null
  const busCheckedNow = (myWantsBus ? 1 : 0) + party.filter(p => p.is_bus_passenger).length
  const busFull = busEnabled && busRemainingBase != null && busCheckedNow >= busRemainingBase

  const myConfirmed = event.my_bookings?.find(b => b.status === "confirmed")
  const myWaitlist  = event.my_bookings?.find(b => b.status === "waitlist")

  const [waitlistPos, setWaitlistPos] = useState(null)
  useEffect(() => {
    if (!myWaitlist?.created_at) { setWaitlistPos(null); return }
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "waitlist")
      .lt("created_at", myWaitlist.created_at)
      .then(({ count }) => setWaitlistPos((count ?? 0) + 1))
  }, [event.id, myWaitlist?.created_at])

  const booked = event.bookings_count
    ?? (event.bookings?.filter(b => b.status === 'confirmed').reduce((s, b) => s + (b.seats || 1), 0) || 0)
  const max = event.max_seats || 0
  const maxPerBooking   = maxSeatsPerBooking(event)
  const isMovieEvent    = event.hub_type === "movie"
  const availableSeats = Math.max(0, max - booked)
  const closed = bookingsClosed(event)

  const [modifySeats, setModifySeats] = useState(
    (myConfirmed?.seats || 0) + (myWaitlist?.seats || 0) || 1
  )
  const [modifying, setModifying] = useState(false)

  const [modParty, setModParty] = useState([])
  const modSeeded = useRef(false)
  const blankRow = () => ({ kind: "resident", member_id: null, contact_id: null, member_name: "", guest_name: "", bring_category_id: null, bring_note: null, is_bus_passenger: false })
  useEffect(() => {
    if (!modifying) { modSeeded.current = false; return }
    const need = Math.max(0, modifySeats - 1)
    if (!modSeeded.current) {
      // First open of this Modify session: seed the whole party — names,
      // dishes AND bus seats — from the existing booking, so Save re-sends
      // them instead of blanks. Previously a race seeded from a
      // not-yet-loaded myAttendees and then refused to re-seed, wiping the
      // party/dishes (Iain 2026-07-18); the bus seat (2026-08-19) is the
      // same shape of bug waiting to happen if it isn't seeded here too.
      modSeeded.current = true
      const seed = (myAttendees || []).map(a => (a.member_id
        ? { kind: "resident", member_id: a.member_id, contact_id: null, member_name: a.member?.name || "Resident", guest_name: "" }
        : a.contact_id
        ? { kind: "resident", member_id: null, contact_id: a.contact_id, member_name: a.contact?.name || "Resident", guest_name: "" }
        : { kind: "guest", member_id: null, contact_id: null, member_name: "", guest_name: a.guest_name || "" }))
        .map((row, i) => ({ ...row, bring_category_id: myAttendees[i]?.bring_category_id || null, bring_note: myAttendees[i]?.bring_note || null, is_bus_passenger: !!myAttendees[i]?.is_bus_passenger }))
      const copy = seed.slice(0, need)
      while (copy.length < need) copy.push(blankRow())
      setModParty(copy)
      setModWantsBus(myWantsBus)
    } else {
      // Subsequent seat changes within the session: resize, keep what's there.
      setModParty(prev => {
        const copy = prev.slice(0, need)
        while (copy.length < need) copy.push(blankRow())
        return copy
      })
    }
  }, [modifying, modifySeats, myAttendees, myWantsBus])
  const modNeed = Math.max(0, modifySeats - 1)
  const modBusCheckedNow = (modWantsBus ? 1 : 0) + modParty.filter(p => p.is_bus_passenger).length
  const modBusFull = busEnabled && busRemainingBase != null && modBusCheckedNow >= busRemainingBase
  // Also now covers contact_id, matching partyValid above -- modPartyValid
  // was missing it (a pre-existing gap: a contact picked as a party member
  // on Modify was silently never counted as "filled"), found while adding
  // the optional-naming check right next to it.
  const modPartyValid = !requireNaming || (modParty.length === modNeed && modParty.every(isRowFilled))

  function showToast(msg, type = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleBook(acceptSplit = false) {
    setLoading(true)
    try {
      const res = await authedFetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, seats, accept_split: acceptSplit, attendees: partyToAttendees(party), bring_category_id: myBring.category_id, bring_note: myBring.note, bus_passenger: myWantsBus }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Booking failed", "error"); return }
      if (data.status === "split_offer") { setSplitOffer(data); return }
      // Success — clear any dialog and return to the event screen the booking
      // was opened from (Iain 2026-07-18). EC edits to event content don't
      // close — this is only the member booking action.
      setSplitOffer(null)
      if (data.status === "confirmed") {
        showToast(`Booked — ${data.seats} seat${data.seats !== 1 ? "s" : ""} confirmed!`)
      } else if (data.status === "split_confirmed") {
        if (data.confirmed === 0) {
          showToast(`${data.waitlisted} seat${data.waitlisted !== 1 ? "s" : ""} added to waitlist`, "warn")
        } else {
          showToast(`${data.confirmed} seat${data.confirmed !== 1 ? "s" : ""} confirmed · ${data.waitlisted} on waitlist`, "warn")
        }
      }
      onRefresh()
      if (onClose) setTimeout(() => onClose(), 600)
    } finally { setLoading(false) }
  }

  async function handleModify() {
    setLoading(true)
    try {
      const res = await authedFetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, seats: modifySeats, attendees: partyToAttendees(modParty), bring_category_id: myBring.category_id, bring_note: myBring.note, bus_passenger: modWantsBus }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Update failed", "error"); return }
      showToast("Booking updated")
      setModifying(false)
      onRefresh()
      if (onClose) setTimeout(() => onClose(), 600)
    } finally { setLoading(false) }
  }

  async function handleCancel() {
    if (loading) return
    setLoading(true)
    try {
      const res = await authedFetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Cancel failed", "error"); return }
      setConfirm(false)
      onRefresh()
      // Back out to the event/club screen rather than sitting on an empty
      // booking modal (Iain 2026-07-18).
      if (onClose) onClose()
    } finally { setLoading(false) }
  }

  // Idea 2 of the EC payment model (2026-07-12): resident self-flags they've
  // paid. Badge stays "Booked" -- this only adds secondary text/notification,
  // the EC still does the final confirm via the Paid/Unpaid toggle.
  async function handleMarkSubmitted(amount, note) {
    setSubmitting(true)
    try {
      const res = await authedFetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id, action: "mark_payment_submitted",
          ...(amount !== undefined && amount !== "" ? { amount } : {}),
          ...(note ? { note } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || "Failed to mark as submitted", "error"); return }
      showToast("Marked as submitted — your Event Coordinator will confirm")
      setShowSelfReport(false); setSelfAmount(""); setSelfNote("")
      onRefresh()
    } finally { setSubmitting(false) }
  }

  // Sign-up style (one seat, no seat picker, no Modify Seats) — a club flag
  // now, not a hub name. Book Club = true; Dinner Club will be false.
  const isBookclubEvent = clubCaps(event.club).singleSignup

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && (
        <ConfirmDialog
          message="This will cancel your booking for this event."
          paymentNote={event.payment_required ? "If you paid, please contact the Event Coordinator to arrange a refund." : null}
          onConfirm={handleCancel}
          onCancel={() => { if (!loading) setConfirm(false) }}
          confirming={loading}
        />
      )}
      {splitOffer && (
        <SplitDialog offer={splitOffer} onAccept={() => handleBook(true)} onDecline={() => setSplitOffer(null)} />
      )}

      {!isBookclubEvent && max > 0 && <CapacityBar booked={booked} max={max} waitlist={event.waitlist_count || 0} />}

      {!myConfirmed && !myWaitlist && (
        <div>
          {isBookclubEvent && event.book_conflict_title ? (
            <div style={{ background: "var(--danger)10", border: "1px solid var(--danger)", borderRadius: 10,
              padding: "12px 14px", fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>
              You still have <strong>"{event.book_conflict_title}"</strong> checked out — return it to your Event
              Coordinator before joining a different book.
            </div>
          ) : closed ? (
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Bookings Closed</div>
              {event.reservation_cutoff && (
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>Closed {cutoffLabel(event.reservation_cutoff)}</div>
              )}
            </div>
          ) : (
            <>
              {/* Seat picker used to only render while availableSeats > 0,
                  so once an event hit 0 confirmed seats free, a resident
                  joining the waitlist could only ever request exactly 1
                  seat -- no way to ask for 2 together, even though
                  max_seats_per_booking allowed it and the server/SplitDialog
                  already fully support an all-waitlist multi-seat request
                  (see the allWaitlist branch in SplitDialog, and handleBook's
                  own "N seats added to waitlist" toast, both pre-existing and
                  previously unreachable). Fixed 2026-08-23 (Iain, "The Way"):
                  the picker now always shows once bookings aren't closed --
                  requesting more than what's free correctly triggers the
                  existing split-confirmation dialog either way. */}
              {!isBookclubEvent && (
                <>
                  <SeatSelector value={seats} min={1} max={maxPerBooking} onChange={setSeats} />
                  {isMovieEvent && maxPerBooking > 1 && (
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>Max {maxPerBooking} seats per booking</div>
                  )}
                </>
              )}
              {bringApplicable && bringCats.length > 0 && (
                <BringPicker cats={bringCats} categoryId={myBring.category_id} note={myBring.note}
                  onChange={setMyBring} colour="var(--amber)" required={bringRequired} label="What are you bringing?" />
              )}
              {busEnabled && (
                <div style={{ marginBottom: 10 }}>
                  <Toggle value={myWantsBus} disabled={busFull && !myWantsBus}
                    onChange={setMyWantsBus}
                    label="🚌 I need a seat on the bus" />
                  {busFull && !myWantsBus && (
                    <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 2 }}>The bus is full.</div>
                  )}
                </div>
              )}
              {!isBookclubEvent && seats > 1 && (
                <PartyPicker count={seats - 1} allowGuests={allowGuests} members={members}
                  excludeIds={me?.id ? [me.id] : []} value={party} onChange={setParty}
                  bringCats={bringApplicable ? bringCats : []} taken={taken} required={requireNaming}
                  bus={{ enabled: busEnabled, full: busFull }} />
              )}
              <button onClick={() => handleBook()} disabled={loading || (seats > 1 && !partyValid) || !bringValid}
                style={{ width: "100%", padding: "14px 0", background: "var(--amber)", color: "#fff", border: "none",
                  borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: (loading || (seats > 1 && !partyValid) || !bringValid) ? "not-allowed" : "pointer", opacity: (loading || (seats > 1 && !partyValid) || !bringValid) ? 0.7 : 1 }}>
                {loading ? "Booking…" : isBookclubEvent ? "Sign Up" : availableSeats === 0 ? "Join Waitlist" : "Book Now"}
              </button>
              {event.payment_required && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginTop: 8 }}>
                  {event.cost ? `$${parseFloat(event.cost).toFixed(2)} per seat — ` : ""}Payment is collected by your Event Coordinator.
                  {event.payment_due_by && <><br />Payment due by {fmtDate(event.payment_due_by)}. Your seat is kept either way.</>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(myConfirmed || myWaitlist) && !modifying && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            {myConfirmed && (() => {
              const seats = myConfirmed.seats || 1
              const totalCost = seatsCost(event, seats)
              const badge = bookingStatusBadge(myConfirmed, event)
              const statusWord = badge.label.toLowerCase() // "booked" or "confirmed" — canonical, see lib/payments.js
              // Partial (2026-08-11 follow-up, Iain -- Spring Ball): this is
              // the detail-screen mirror of the Scheduled card's strip --
              // same bug (re-showing the full amount as if nothing had been
              // paid), same fix (show the actual remaining balance).
              const isPartialBooking = event.payment_required && badge.label === "Partial"
              const balance = isPartialBooking ? balancePhrase(myConfirmed, event, seats) : null
              const submitted = event.payment_required && !isPartialBooking && badge.label !== "Confirmed" && computeIsSubmitted(myConfirmed)
              const label = event.payment_required
                ? (badge.label === "Confirmed"
                    ? `✓ ${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Paid${totalCost ? " " + totalCost : ""}`
                    : isPartialBooking
                      ? `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Unpaid ${balance}`
                      : submitted
                        ? `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Payment submitted${totalCost ? " " + totalCost : ""}`
                        : `${seats} seat${seats !== 1 ? "s" : ""} ${statusWord} · Unpaid${totalCost ? " " + totalCost : ""}`)
                : `✓ ${seats} seat${seats !== 1 ? "s" : ""} confirmed`
              const colour = event.payment_required
                ? (badge.label === "Confirmed" ? "var(--green)" : isPartialBooking ? "#0369a1" : submitted ? "#0f766e" : "#d97706")
                : "var(--green)"
              return <StatusPill label={label} colour={colour} />
            })()}
            {myWaitlist && <StatusPill label={`⏳ ${myWaitlist.seats} on waitlist${waitlistPos ? ` (#${waitlistPos})` : ""}`} colour="var(--amber-dark)" />}
          </div>
          {myConfirmed && bringApplicable && (() => {
            const catLabel = (id) => bringCats.find(c => c.id === id)?.label
            const mine = myBring.category_id ? { label: catLabel(myBring.category_id), note: myBring.note } : null
            if (!mine && !myAttendees.length) return null
            return (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, background: "var(--surface2)", borderRadius: 10, padding: "8px 10px" }}>
                {(() => {
                  const line = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                  const dish = (label, note) => label ? `${label}${note ? ` — ${note}` : ""}` : ""
                  return (
                    <>
                      {mine && <div style={{ ...line, color: "var(--text)" }}><strong>You</strong>{dish(mine.label, mine.note) ? ` · ${dish(mine.label, mine.note)}` : ""}</div>}
                      {myAttendees.map((a, i) => {
                        const nm = a.member_id ? (a.member?.name || "Resident") : a.contact_id ? (a.contact?.name || "Resident") : `${a.guest_name} (guest)`
                        const d = dish(a.bring_category_id ? catLabel(a.bring_category_id) : null, a.bring_note)
                        return <div key={i} style={{ ...line, color: "var(--text-dim)" }}>{nm}{d ? ` · ${d}` : ""}</div>
                      })}
                    </>
                  )
                })()}
              </div>
            )
          })()}
          {myConfirmed && busEnabled && (() => {
            const riders = [
              ...(myWantsBus ? ["You"] : []),
              ...myAttendees.filter(a => a.is_bus_passenger).map(a =>
                a.member_id ? (a.member?.name || "Resident") : a.contact_id ? (a.contact?.name || "Resident") : `${a.guest_name} (guest)`),
            ]
            if (!riders.length) return null
            return (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, background: "var(--surface2)", borderRadius: 10, padding: "8px 10px" }}>
                <BusIcon size={12} /> <strong>On the bus:</strong> {riders.join(", ")}
              </div>
            )
          })()}
          {myConfirmed && event.payment_required && event.payment_due_by && !computeIsPaid(myConfirmed) && (
            <div style={{ fontSize: 12, color: "var(--amber-dark)", lineHeight: 1.4 }}>
              Payment due by {fmtDate(event.payment_due_by)}.
            </div>
          )}
          {myConfirmed && event.payment_required && !computeIsPaid(myConfirmed) && (
            computeIsSubmitted(myConfirmed) ? (
              <div style={{ fontSize: 12, color: "var(--teal)", lineHeight: 1.4 }}>
                🧾 Payment submitted — your Event Coordinator will confirm it shortly.
              </div>
            ) : showSelfReport ? (() => {
              // Balance-based (2026-08-11 follow-up, Iain -- Spring Ball):
              // pre-filled with the outstanding BALANCE, not the full
              // amount owed -- on a fresh (nothing paid yet) booking the
              // two are identical, but on a Partial booking the resident
              // should see "$10" (what's left), not "$40" (the whole
              // thing, as if their earlier $30 didn't happen).
              const seats = myConfirmed.seats || 1
              const balanceNum = remainingBalance(myConfirmed, event, seats)
              const owedPhrase = seatsCost(event, seats)
              const isPartialBooking = computeIsPartial(myConfirmed, event)
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--surface2)", borderRadius: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Amount paid</span>
                    <input type="number" min="0" step="1" value={selfAmount} onChange={e => setSelfAmount(e.target.value)}
                      style={{ width: 100, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }} />
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>of {wholeDollar(balanceNum)} balance</span>
                  </div>
                  {isPartialBooking && (
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Completes {owedPhrase} total</div>
                  )}
                  <textarea placeholder="Comment (optional) — e.g. how or when you paid" value={selfNote} onChange={e => setSelfNote(e.target.value)} rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowSelfReport(false); setSelfAmount(""); setSelfNote("") }} disabled={submitting}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={() => handleMarkSubmitted(selfAmount, selfNote)} disabled={submitting}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--teal)", background: "var(--teal)", color: "#fff", cursor: submitting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
                      {submitting ? "Marking…" : "Submit"}
                    </button>
                  </div>
                </div>
              )
            })() : (
              (() => {
                const seats = myConfirmed.seats || 1
                const isPartialBooking = computeIsPartial(myConfirmed, event)
                const balanceNum = remainingBalance(myConfirmed, event, seats)
                return (
                  <button
                    onClick={() => { setShowSelfReport(true); setSelfAmount(String(Math.round(balanceNum))) }}
                    disabled={submitting}
                    style={{ width: "100%", padding: "12px 0", background: "transparent", border: "1px solid var(--teal)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", color: "var(--teal)", opacity: submitting ? 0.7 : 1 }}>
                    {isPartialBooking ? `I've Paid the ${wholeDollar(balanceNum)} Balance — Mark as Submitted` : "I've Paid — Mark as Submitted"}
                  </button>
                )
              })()
            )
          )}
          {myConfirmed && !isBookclubEvent && !closed && (
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
          <SeatSelector value={modifySeats} min={1} max={myWaitlist ? (myConfirmed?.seats || 0) + (myWaitlist?.seats || 0) : maxPerBooking} onChange={setModifySeats} />
          {myWaitlist && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
              Can&apos;t increase seats on a split booking — cancel and rebook to request more seats.
            </div>
          )}
          {bringApplicable && bringCats.length > 0 && (
            <BringPicker cats={bringCats} categoryId={myBring.category_id} note={myBring.note}
              onChange={setMyBring} colour="var(--amber)" required={bringRequired} label="What are you bringing?" />
          )}
          {busEnabled && (
            <div style={{ marginBottom: 10 }}>
              <Toggle value={modWantsBus} disabled={modBusFull && !modWantsBus}
                onChange={setModWantsBus}
                label="🚌 I need a seat on the bus" />
              {modBusFull && !modWantsBus && (
                <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 2 }}>The bus is full.</div>
              )}
            </div>
          )}
          {modifySeats > 1 && (
            <PartyPicker count={modifySeats - 1} allowGuests={allowGuests} members={members}
              excludeIds={me?.id ? [me.id] : []} value={modParty} onChange={setModParty}
              bringCats={bringApplicable ? bringCats : []} taken={taken} required={requireNaming}
              bus={{ enabled: busEnabled, full: modBusFull }} />
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModifying(false)}
              style={{ flex: 1, padding: "12px 0", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}>Cancel</button>
            <button onClick={handleModify} disabled={loading || (modifySeats > 1 && !modPartyValid) || !bringValid}
              style={{ flex: 1, padding: "12px 0", background: "var(--amber)", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: (loading || (modifySeats > 1 && !modPartyValid)) ? "not-allowed" : "pointer", color: "#fff", opacity: (loading || (modifySeats > 1 && !modPartyValid)) ? 0.7 : 1 }}>
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
  // Bumped by a member booking action (BookingSection) so the coordinator panel,
  // which fetches its own attendee data, re-syncs instead of showing stale seats.
  const [coordRefreshKey, setCoordRefreshKey] = useState(0)
  const refreshAll = () => { setCoordRefreshKey(k => k + 1); onRefresh?.() }
  const [open, setOpen] = useState(false)
  const [coordinators, setCoordinators] = useState([])
  const [showMenu, setShowMenu] = useState(false)
  // Owner of this event's own hub/club gets EC view area-wide, the same as
  // admin -- Iain, 2026-08-10: "same options as admin ... just for that
  // area". event.club_id is the truth for a club event; otherwise the
  // event's own hub_type ('movie'/'social') is the area key OwnersManager
  // already uses. Called unconditionally (before the `if (!event) return
  // null` below) -- a hook can't follow a conditional early return, same
  // Rules-of-Hooks class of bug fixed in PR #71 (2026-08-09).
  const { owners: areaOwners } = useOwners(event?.club_id ? "club" : "hub", event?.club_id || event?.hub_type)

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

  // Lock background scroll while the sheet is open. Without this, iOS Safari
  // can "scroll chain" a touch-drag inside the sheet's own scroll container
  // through to the page behind it once the drag starts near the sheet's own
  // scroll boundary -- which reads to the user as the sheet being stuck /
  // unable to reach content further down (Iain + Scampi hit this live,
  // 2026-07-25, on the taller booking form the new attendee-naming picker
  // produces -- previously most forms fit on one screen so this scroll-chain
  // path rarely got exercised). Combined with overscrollBehavior:"contain"
  // on the sheet's own scroll container below.
  useEffect(() => {
    if (!event) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prevOverflow }
  }, [event])

  if (!event) return null

  // Public/private is now purely a data question, not a display question:
  // is_public controls server-side inclusion in the anonymous /cal feed
  // (app/api/events/route.js) -- an event this component is ever handed is
  // always shown in full (title, image, date, location, coordinator,
  // description). The ONLY thing gated on isAuthenticated is the ability to
  // act on it -- book, modify, cancel, or manage as coordinator (Iain,
  // 2026-08-04: "NO event is editable, bookable etc when showing on the
  // public facing calendar... always pointed to login to book their seats").
  // On the public /cal page, isAuthenticated is always forced false
  // regardless of the visitor's real session -- see app/cal/page.js.
  const colour = event.club ? clubColour(event.club) : (HUB_COLOURS[event.hub_type] || "var(--amber)")

  // Check if current user is a coordinator for this event
  const isEC = member && coordinators.some(ec => ec.member_id === member.id)
  const isAreaOwner = !!member?.id && areaOwners.some(o => o.id === member.id)
  // Also allow admins to see coordinator panel
  const showCoordinatorPanel = isAuthenticated && (isEC || isAdmin || isAreaOwner)

  function handleClose() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  return (
    <Portal>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, transition: "opacity 0.25s ease" }} />

      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32 }}>

        <div style={{ height: 6, background: colour }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: clubInk(colour), textTransform: "capitalize" }}>
            {event.club?.name || (event.hub_type === "bookclub" ? "Book Club" : event.hub_type)}
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
          {clubCaps(event.club).hasBooks && event.book?.cover_url && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <img src={event.book.cover_url} alt={event.book.title}
                style={{ height: 160, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }} />
            </div>
          )}
          {/* Social event image */}
          {(event.hub_type === "social" || event.club) && event.image_url && (
            <img src={event.image_url} alt={event.title}
              style={{
                width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, marginBottom: 14,
                objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 50}%`,
              }} />
          )}

          {/* Title */}
          <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, marginBottom: 4, color: "var(--text)" }}>
            {event.title}
          </h2>

          {/* Date/time */}
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: event.location ? 4 : 10, fontWeight: 500 }}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5}}><CalendarIcon size={13} />{fmtDate(event.event_date)}{event.event_time ? ` at ${fmtTime(event.event_time)}` : ''}</span>
          </div>

          {/* Location — shown for any hub whenever the event carries one
              (Iain, 2026-08-23: must show throughout, not just some hubs) */}
          {event.location && (
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
              📍 {event.location_type === "offsite" ? event.location.split("\n")[0] : event.location}
            </div>
          )}

          {/* EC names — on one line under location */}
          <ECNames coordinators={coordinators} colour={colour} />

          {/* Bus driver — sits directly with Coordinator, social offsite only */}
          {event.has_bus && event.bus_driver && (
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <BusIcon size={14} /> <span>{event.bus_driver.name || event.bus_driver.username}</span>
            </div>
          )}

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

              {/* Book Club: member has the physical kit checked out */}
              {clubCaps(event.club).hasBookReturn && event.my_bookings?.find(b => b.status === "confirmed")?.has_book && (
                <div style={{ background: "var(--purple)15", border: "1px solid var(--purple)", borderRadius: 10,
                  padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--purple)" }}>
                  📖 You have the book{event.book_return_date ? ` — return by ${fmtDate(event.book_return_date)}` : ""}
                </div>
              )}

              {/* Book-specific */}
              {clubCaps(event.club).hasBooks && event.book && (
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

              {/* Social */}
              {event.hub_type === "social" && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "inline-block", padding: "4px 12px",
                      background: event.cost > 0 ? "var(--amber-light)" : "var(--green-light, #dcfce7)",
                      color: event.cost > 0 ? "var(--amber-dark)" : "#15803d",
                      borderRadius: 20, fontSize: 14, fontWeight: 700 }}>
                      {fmtCost(event.cost)}
                    </div>
                    {event.has_dining && ((event.menu_type === "text" && event.menu_text) || (event.menu_type === "file" && event.menu_url)) && (
                      <button onClick={() => setShowMenu(true)} style={{
                        background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                        color: clubInk(colour), textDecoration: "underline", fontFamily: "inherit", padding: 0,
                      }}>View Menu</button>
                    )}
                  </div>
                  {event.description && <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: "8px 0 0" }} dangerouslySetInnerHTML={{ __html: bbToHtml(event.description, colour) }} />}
                </div>
              )}

              {showMenu && (
                <MenuModal event={event} colour={colour} onClose={() => setShowMenu(false)} />
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
                  <BookingSection event={event} onRefresh={refreshAll} onClose={onClose} />
                ) : (
                  <LoginPrompt />
                )}
              </div>

              {/* Coordinator Panel */}
              {showCoordinatorPanel && (
                <CoordinatorPanel event={event} colour={colour} onRefresh={onRefresh} currentMember={member} refreshKey={coordRefreshKey} />
              )}
            </>
        </div>
      </div>
    </Portal>
  )
}
