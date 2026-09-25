"use client"
import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import EventSlideOut from "@/components/EventSlideOut"
import { BusIcon } from "@/components/NavIcons"
import RichEditor, { bbToHtml } from "@/components/RichEditor"
import { ContactBar } from "@/components/OwnersManager"
import ExpandableText from "@/components/ExpandableText"
import { getToken } from "@/components/ResidentEditPanel"
import { authedFetch } from "@/lib/getAuthToken"
import { useOwners } from "@/lib/useOwners"
import { clubCaps } from "@/lib/clubs"
import { clubTextOn, clubInk } from "@/lib/clubColours"
import { sydneyTodayStr, dateStrPlusDays } from "@/lib/date"
import { bookingsClosed } from "@/lib/booking"
import EventCoordinators from "@/components/EventCoordinators"
import PastEventsAccordion from "@/components/PastEventsAccordion"
import RecurrencePicker from "@/components/RecurrencePicker"
import { nextOccurrence } from "@/lib/recurrence"
import EventImagePicker from "@/components/EventImagePicker"
import MembersToggle from "@/components/MembersToggle"
import { useLocations } from "@/lib/useLocations"
import { cutoffToDateValue, cutoffFromDateValue } from "@/lib/booking"
import TimeField from "@/components/TimeField"
import { needsSpaceValidation } from "@/lib/eventClash"
import { useSameDateWarning } from "@/components/SameDateWarning"
import { useRequestOnlyAcknowledge } from "@/components/RequestOnlyAcknowledge"
import AttendeeNamingPicker from "@/components/AttendeeNamingPicker"
import { INVALID_FIELD_STYLE, scrollToFirstInvalid } from "@/lib/formValidation"
import { byOwnThenName, ordinal } from "@/lib/sortNames"
import { useWaitlistInfo } from "@/lib/useWaitlistInfo"
import { waitlistLabel, waitlistPositionMap } from "@/lib/waitlist"
import { resolveMemberName } from "@/lib/memberName"
import { exportAttendeeListPdf, exportPaymentReconciliationPdf } from "@/lib/attendeeExport"
// Payment-management port (2026-09-22, Iain -- Club payment parity): same
// hub-agnostic helpers Social's events page and EventSlideOut.js's
// CoordinatorPanel already use, see lib/payments.js for the shared
// status/reconciliation math.
import { paymentSummary, reconciliationIsStale, isPaid as isPaymentPaid, isSubmitted as isPaymentSubmitted, isPartial as isPaymentPartial, seatsCost, remainingBalance, wholeDollar, balancePhrase, isRemindedToday } from "@/lib/payments"
import { buildCarSections, buildTransportExportSections, VEHICLE_OFFER_SELECT, VEHICLE_OFFER_PASSENGER_SELECT } from "@/lib/vehicleSections"
import { CopyLinkButton, AddToCalendarButton } from "@/components/EventShareActions"
import { buildShareUrl, resolveEventWindow } from "@/lib/eventShare"
import { isHtmlContent } from "@/lib/richText"

// ── Helpers ───────────────────────────────────────────────────────────────────
function localDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}
function fmtYear(str) {
  if (!str) return ""
  return localDate(str).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}
// Same 12-hour formatter as Social's own EventCard (app/(app)/social/events/page.js)
// -- added 2026-09-15 (Iain, item #7: "Groups and Clubs Event tiles are not
// displaying EC, Location, Date and Time in the same consistent layout as
// other hubs") so Club event tiles show a start time the same way every
// other hub does, instead of date-only.
function fmtTime(str) {
  if (!str) return ""
  const [h, m] = str.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}


function Toast({ msg, type }) {
  if (!msg) return null
  // amber "warn" variant added 2026-08-04 for the Request Only reminder,
  // matching the type-aware Toast already used in screenings/social.
  const bg = type === "warn" ? "var(--amber-dark)" : "#15803d"
  return (
    <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: bg, color: "#fff", padding: "10px 20px", borderRadius: 12, fontSize: 14,
      fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center" }}>{msg}</div>
  )
}

// ── Booking Strip ────────────────────────────────────────────────────────────
function BookingStrip({ isJoined, isWaitlisted = false, seats = 1, waitlistSeats = 0, waitlistPosition = null, hasBook, bookReturnDate, closed, blocked, open, colour = "var(--purple)" }) {
  const base = { display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0.55rem 1rem", fontSize: "0.82rem", fontWeight: 600, gap: "0.5rem" }
  // "Open, all welcome" events (Iain, 2026-09-11 -- Groups & Clubs dry run):
  // no booking exists or is needed, so this takes priority over every other
  // state -- checked first.
  if (open) {
    return (
      <div style={{ ...base, background: colour + "14", borderTop: `1px solid ${colour}33` }}>
        <span style={{ color: clubInk(colour) }}>✓ Open — All Welcome</span>
        <span style={{ color: clubInk(colour), fontSize: "0.75rem", opacity: 0.85 }}>No booking needed</span>
      </div>
    )
  }
  // Bug fixed 2026-08-21 (Iain): "Tap to sign up" used to show regardless of
  // the reservation cut-off having passed -- same fix shape as Movies/Social,
  // see lib/booking.js's bookingsClosed(). blocked is computed by EventCard
  // below, true only when the viewer hasn't joined AND isn't Owner/EC/Admin.
  // Waitlisted (BUG-067, 2026-09-26): Groups & Clubs had no waitlist state
  // at all -- a waitlisted resident saw the same "Tap to sign up" as someone
  // with no booking. Same wording as every other hub (lib/waitlist.js).
  if (!isJoined && isWaitlisted) {
    return (
      <div style={{ ...base, background: "#fffbeb", borderTop: "1px solid #fde68a" }}>
        <span style={{ color: "#d97706" }}>⏳ {waitlistLabel(waitlistPosition)} · {waitlistSeats} place{waitlistSeats !== 1 ? "s" : ""}</span>
        <span style={{ color: "#d97706", fontSize: "0.75rem" }}>Tap to manage →</span>
      </div>
    )
  }
  if (!isJoined && closed) {
    return (
      <div style={{ ...base, background: "#fee2e2", borderTop: "1px solid #fca5a5" }}>
        <span style={{ color: "#991b1b", fontWeight: 700 }}>Bookings are closed</span>
      </div>
    )
  }
  if (isJoined) {
    return (
      <div style={{ background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}>
        <div style={base}>
          <span style={{ color: "#15803d" }}>
            ✓ Booked {seats} place{seats !== 1 ? "s" : ""}
            {waitlistSeats > 0 && <span style={{ color: "#d97706" }}>{` · +${waitlistSeats} ${waitlistLabel(waitlistPosition).replace(/^On/, "on")}`}</span>}
          </span>
          <span style={{ color: "#15803d", fontSize: "0.75rem" }}>Tap to manage →</span>
        </div>
        {hasBook && bookReturnDate && (
          <div style={{ padding: "0 1rem 0.55rem", fontSize: "0.78rem", fontWeight: 600, color: "#15803d" }}>
            Return Book By - {fmtDate(bookReturnDate)}
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ ...base, background: colour + "0f", borderTop: `1px solid ${colour}26` }}>
      <span style={{ color: clubInk(colour), fontSize: "0.75rem" }}>Tap to sign up →</span>
    </div>
  )
}

// ── Book Club Event Card ─────────────────────────────────────────────────────
function EventCard({ event, label, booking, myWaitlist = null, waitlistInfo = null, onOpen, onEdit = null, colour = "var(--purple)", showToast, club }) {
  const router = useRouter()
  const { member, isAdmin } = useUser()
  // Club Owner gets the same manage/EC-view options an admin has, scoped to
  // this club only (Iain, 2026-08-10).
  const { owners: clubOwnersForCard } = useOwners("club", club?.id)
  const isOwner = !!member?.id && clubOwnersForCard.some(o => o.id === member.id)
  const caps = clubCaps(club)
  const [attendeesOpen,   setAttendeesOpen]   = useState(false)
  const [attendees,       setAttendees]       = useState(null)
  // Admin-only Waitlist list under Attendees, queue order + (1st)/(2nd) --
  // parity with Social/Special Events' tile and Show Time (BUG-067).
  const [waitlistRows,    setWaitlistRows]    = useState([])
  const [attendeesLoading,setAttendeesLoading]= useState(false)
  const [togglingId,      setTogglingId]      = useState(null)
  const [remindingId,     setRemindingId]     = useState(null)
  const [remindedId,      setRemindedId]      = useState(null)
  const [carData, setCarData] = useState({ carByOwner: {}, carSections: [], carPeopleKeys: new Set() })
  // Payment-management state (2026-09-22 port from Social's events page) --
  // kept separate from the book-return toggling/reminding state above
  // (togglingId/remindingId/remindedId), which is a distinct action on the
  // same row.
  const [paymentData,       setPaymentData]       = useState(null)
  const [payTogglingId,     setPayTogglingId]     = useState(null)
  const [recordingId,       setRecordingId]       = useState(null)
  const [recordAmount,      setRecordAmount]      = useState("")
  const [recordNote,        setRecordNote]        = useState("")
  const [resetConfirmId,    setResetConfirmId]    = useState(null)
  const [remindingPaymentId,setRemindingPaymentId]= useState(null)
  const [remindedPaymentId, setRemindedPaymentId] = useState(null)
  const [closingOutPayments,setClosingOutPayments]= useState(false)
  const [togglingRefundId,  setTogglingRefundId]  = useState(null)
  const book          = event.books || event.book_snapshot
  const bookLink      = book?.rating_link || null
  const communityScore = book?.avg_score ? parseFloat(book.avg_score).toFixed(1) : null
  const voteCount      = book?.vote_count || 0

  const activeECs = (event.event_coordinators || []).filter(ec => !ec.replaced_at)
  const coordinator = activeECs.map(ec => ec.members?.name || ec.members?.username).filter(Boolean).join(", ") || null
  const ecNames = activeECs.map(ec => ec.members?.name || ec.members?.username).filter(Boolean)
  const isEC = !!(member && activeECs.some(ec => ec.member_id === member.id))
  const canManageBooks = isAdmin || isEC || isOwner
  // Paid-event gate (2026-09-22 port) -- same shape as Social's isPaidEvent.
  const isPaidEvent = !!(event.payment_required && event.cost > 0)

  async function loadWaitlist() {
    if (!isAdmin) { setWaitlistRows([]); return }
    const { data } = await supabase
      .from("bookings")
      .select("id, seats, booked_at, member_id, members(id, name, display_name, username, hide_name), contacts(id, name)")
      .eq("event_id", event.id)
      .eq("status", "waitlist")
    const rows = (data || []).map(b => ({ ...b, status: "waitlist" }))
    const pos = waitlistPositionMap(rows)
    setWaitlistRows(rows.map(b => ({ ...b, position: pos.get(b.id) })).sort((a, b) => a.position - b.position))
  }

  async function loadAttendees() {
    const { data } = await supabase
      .from("bookings")
      .select("id, seats, has_book, book_given_at, name_hidden, bring_note, bus_passenger, members(id, name, display_name, username, hide_name), contacts(id, name), bring:club_bring_categories!bring_category_id(label)")
      .eq("event_id", event.id)
      .eq("status", "confirmed")
    // Named additional attendees (the party), grouped by the booker.
    const { data: partyRows } = await supabase
      .from("booking_attendees")
      .select("owner_id, owner_contact_id, member_id, contact_id, guest_name, bring_note, is_bus_passenger, member:members!member_id(name, display_name, hide_name), contact:contacts!contact_id(name), bring:club_bring_categories!bring_category_id(label)")
      .eq("event_id", event.id)
    // Personal vehicle offers (Iain, follow-up on PR #147: this card's own
    // inline attendee list is a separate implementation from
    // EventSlideOut.js's Coordinator View and was missed when the
    // driver/passenger icons were first added there -- see
    // lib/vehicleSections.js's header comment). Fetched alongside the two
    // queries above so one loadAttendees() call builds the whole list.
    const [{ data: offers }, { data: passengers }] = await Promise.all([
      supabase.from("vehicle_offers").select(VEHICLE_OFFER_SELECT).eq("event_id", event.id),
      supabase.from("vehicle_offer_passengers").select(VEHICLE_OFFER_PASSENGER_SELECT).eq("event_id", event.id),
    ])
    const { carByOwner, carSections, carPeopleKeys } = buildCarSections(
      offers || [], passengers || [],
      (m, fallback) => resolveMemberName(m, { viewerId: member?.id, canManage: canManageBooks, selfLabel: "You", fallback }),
    )
    setCarData({ carByOwner, carSections, carPeopleKeys })
    const partyByOwner = {}
    for (const p of partyRows || []) {
      // Composite key: a walk-up booking's party is owned by a contact
      // (owner_contact_id), not a member (owner_id) -- migration 061, 2026-07-23.
      const ownerKey = p.owner_id ? `m:${p.owner_id}` : `c:${p.owner_contact_id}`
      ;(partyByOwner[ownerKey] = partyByOwner[ownerKey] || []).push(p)
    }
    // Own row always pinned to the top — consistent with every other attendee
    // list (Movies/Social inline lists, EventSlideOut's Coordinator View).
    // Contacts (residents with no app login) have no hide_name concept, so
    // their name is never masked. 2026-07-23 (Iain): the booking owner
    // always sees their own party's real names regardless of privacy —
    // that's the `!isOwn` bypass added below, matching the same fix in
    // Social and Movies.
    //
    // display_name (2026-08-15): this list was missed in the original
    // rollout -- it was still showing b.members?.name (Real Name) to every
    // viewer, including non-admins, who should only ever see Display Name.
    // Routed through the same resolveMemberName() every other attendee list
    // uses. name_hidden is a per-booking privacy override on TOP of the
    // member's own hide_name -- folded into a synthetic hide_name so
    // resolveMemberName's masking still covers both.
    setAttendees((data || []).map(b => {
      const isOwn     = b.members?.id === member?.id
      const isPrivate = !!(b.members?.hide_name || b.name_hidden)
      const memberForName = b.members ? { ...b.members, hide_name: isPrivate } : null
      // Driver/passenger status (Iain, follow-up on PR #147): "a car icon
      // next to drivers and a human icon next to passengers... passengers
      // nested under their name." Same carByOwner/carSections shape
      // EventSlideOut.js's Coordinator View already uses -- see
      // lib/vehicleSections.js.
      const carOwnerKey = b.members?.id ? `m:${b.members.id}` : b.contacts?.id ? `c:${b.contacts.id}` : null
      const carStatus = carOwnerKey ? carByOwner[carOwnerKey] : null
      const drivingSection = carStatus?.role === "driving" ? carSections.find(s => s.driverKey === carOwnerKey) : null
      return {
        id: b.id,
        name: memberForName
          ? resolveMemberName(memberForName, {
              viewerId: member?.id, canManage: canManageBooks, selfLabel: "You",
              fallback: b.members?.username || b.contacts?.name || "Member",
            })
          : (b.contacts?.name || "Member"),
        isOwn,
        isPrivate,
        seats: b.seats || 1,
        busPassenger: !!b.bus_passenger,
        carOwnerKey,
        carStatus,
        drivingPassengers: drivingSection?.passengers || [],
        hasBook: !!b.has_book,
        bring: b.bring?.label || null,
        bringNote: b.bring_note || null,
        bookGivenAt: b.book_given_at,
        party: (() => {
          const ownerKey = b.members?.id ? `m:${b.members.id}` : b.contacts?.id ? `c:${b.contacts.id}` : null
          return ownerKey ? (partyByOwner[ownerKey] || []) : []
        })().map(p => {
          const gOwn  = p.member_id && p.member_id === member?.id
          return {
            name: gOwn ? "You"
              : p.guest_name ? p.guest_name
              : p.contact_id ? (p.contact?.name || "Resident")
              : p.member
                ? resolveMemberName(p.member, { viewerId: member?.id, canManage: canManageBooks || isOwn, selfLabel: "You", fallback: "Resident" })
                : "Resident",
            guest: !!p.guest_name,
            busPassenger: !!p.is_bus_passenger,
            identityKey: p.member_id ? `m:${p.member_id}` : p.contact_id ? `c:${p.contact_id}` : p.guest_name ? `g:${p.guest_name.trim().toLowerCase()}` : null,
            bring: p.bring?.label || null,
            bringNote: p.bring_note || null,
          }
        }),
      }
    }).sort((a, b) => byOwnThenName(a.isOwn, b.isOwn, a.name, b.name)))
  }

  // Load payment data for the Attendees accordion (2026-09-22 port from
  // Social's events page). Unlike loadAttendees() above (a direct Supabase
  // read -- fine for RLS-open club/booking data), payment fields are only
  // readable through the existing, already-gated GET /api/coordinator
  // endpoint (EC/admin only server-side, same one EventSlideOut.js's
  // CoordinatorPanel already uses for every hub) -- no new server code
  // needed. Kept as its own call, separate from loadAttendees(), since it's
  // conditional on isPaidEvent and canManageBooks while loadAttendees()
  // always needs to run for the plain attendee list.
  async function loadPaymentData() {
    if (!isPaidEvent || !canManageBooks) { setPaymentData(null); return }
    const res = await authedFetch(`/api/coordinator?event_id=${event.id}`)
    if (res.ok) {
      const data = await res.json().catch(() => null)
      setPaymentData(data)
    }
  }

  // Export attendee list as PDF (2026-09-11, Iain -- see the matching
  // handler in components/EventSlideOut.js's CoordinatorPanel). Groups &
  // Clubs/Book Club keeps its own separate inline attendees list on this
  // card, so it needs its own copy built from this component's own
  // already-loaded `attendees` state.
  //
  // Transport sections (Iain, follow-up on PR #147): this card's own export
  // had been missed entirely when Bus/Car/Own-Way sections were first added
  // to the attendee-list export -- built via the same shared
  // buildTransportExportSections() every other hub's own export now calls,
  // so this one can't drift out of sync with them. carData is set by
  // loadAttendees() above, alongside `attendees` itself.
  function handleExportAttendees() {
    const rows = (attendees || []).map(a => ({
      name: a.name,
      seats: a.seats,
      note: (a.party || []).length > 0 ? `With: ${a.party.map(p => p.name).join(", ")}` : "",
    }))
    const transportOwners = (attendees || []).map(a => ({
      key: a.carOwnerKey,
      name: a.name,
      going: true, // this card only ever loads confirmed bookings
      isBusRider: a.busPassenger,
      party: (a.party || []).map(p => ({ identityKey: p.identityKey, label: p.name, bus: p.busPassenger, guest: p.guest })),
    }))
    const transportSections = buildTransportExportSections({
      owners: transportOwners, event, carSections: carData.carSections, carPeopleKeys: carData.carPeopleKeys,
    })
    const ok = exportAttendeeListPdf({
      eventTitle: event.title,
      eventSubtitle: fmtDate(event.event_date),
      sections: [
        { heading: "Attendees", rows },
        ...(event.allow_personal_vehicles || event.has_bus ? transportSections : []),
      ],
      router,
      hubColour: colour,
    })
    if (!ok) window.alert("Couldn't open the attendee export")
  }

  // Export payment reconciliation as PDF (2026-09-22 port from Social's
  // events page -- see handleExportAttendees above for why this card keeps
  // its own copy rather than going through EventSlideOut.js's shared
  // CoordinatorPanel). Built from paymentData, loaded by loadPaymentData()
  // above alongside attendees.
  function handleExportReconciliation() {
    const nameFor = (b) => b.members
      ? resolveMemberName({ ...b.members, hide_name: !!(b.members?.hide_name || b.name_hidden) },
          { viewerId: member?.id, canManage: canManageBooks, selfLabel: "You", fallback: b.members?.username || b.contacts?.name || "Member" })
      : (b.contacts?.name || "Member")
    const rowFor = (b) => ({ name: nameFor(b), seats: b.seats || 1, amount: balancePhrase(b, event, b.seats || 1) })
    const confirmed = (paymentData?.bookings || []).filter(b => b.status === "confirmed")
    const paidRows = [], unpaidRows = [], partialRows = []
    for (const b of confirmed) {
      if (isPaymentPaid(b)) paidRows.push(rowFor(b))
      else if (isPaymentPartial(b, event)) partialRows.push(rowFor(b))
      else unpaidRows.push(rowFor(b))
    }
    const refundRows = (paymentData?.refund_pending || []).map(b => ({
      name: nameFor(b), seats: b.seats || 1, amount: `$${(parseFloat(b.refund_due) || 0).toFixed(2)} due`,
    }))
    ;[paidRows, unpaidRows, partialRows, refundRows].forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))
    const summaryLines = paymentSummaryData ? [
      { label: "Expected", value: `$${paymentSummaryData.expectedTotal.toFixed(2)}` },
      { label: "Collected", value: `$${paymentSummaryData.collectedTotal.toFixed(2)}`, colour: "#166534" },
      { label: "Outstanding", value: `$${paymentSummaryData.outstandingTotal.toFixed(2)}`, colour: paymentSummaryData.outstandingTotal > 0 ? "#92400e" : undefined },
      ...(paymentSummaryData.refundsDueCount > 0 ? [{ label: "Refunds due", value: `$${paymentSummaryData.refundsDueTotal.toFixed(2)}`, colour: "#92400e" }] : []),
    ] : []
    const ok = exportPaymentReconciliationPdf({
      eventTitle: event.title,
      eventSubtitle: fmtDate(event.event_date),
      summaryLines,
      groups: [
        { heading: "Paid", rows: paidRows },
        { heading: "Unpaid", rows: unpaidRows },
        { heading: "Partial", rows: partialRows },
        { heading: "Refunds", rows: refundRows },
      ],
      router,
      hubColour: colour,
    })
    if (!ok) window.alert("Couldn't open the reconciliation export")
  }

  async function toggleAttendees() {
    if (attendeesOpen) { setAttendeesOpen(false); return }
    setAttendeesLoading(true)
    await Promise.all([loadAttendees(), loadPaymentData(), loadWaitlist()])
    setAttendeesLoading(false)
    setAttendeesOpen(true)
  }

  async function toggleHasBook(bookingId, current) {
    setTogglingId(bookingId)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action: "set_has_book", booking_id: bookingId, has_book: !current }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast?.(data.error || "Could not update")
    }
    await loadAttendees()
    setTogglingId(null)
  }

  // Manual "remind to return" nudge (2026-07-15) -- catch-all auto reminder
  // lives in the daily cron (app/api/cron/book-return-check/route.js), this
  // is the proactive one-tap version an EC/admin can send anytime someone
  // still has_book. Kept local to this card (no toast plumbing) -- the bell
  // itself flips to a brief "Sent ✓" confirmation, same lightweight pattern
  // as the Has Book/Returned toggle already uses.
  async function remindBookReturn(bookingId, name) {
    if (remindingId) return
    setRemindingId(bookingId)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action: "remind_book_return", booking_id: bookingId }),
    })
    setRemindingId(null)
    if (res.ok) {
      setRemindedId(bookingId)
      setTimeout(() => setRemindedId(null), 2500)
      showToast?.(`Reminder sent to ${name}`)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast?.(data.error || "Could not send reminder")
    }
  }

  // ── Payment handlers (2026-09-22 port from app/(app)/social/events/page.js)
  // -- same /api/coordinator PATCH actions Social and EventSlideOut.js's
  // CoordinatorPanel already use, no server changes needed. Follows this
  // card's own authedFetch convention (not Social's older raw-fetch +
  // getAuthToken pattern) -- consistent with toggleHasBook/remindBookReturn
  // above.
  async function handleTogglePayment(bookingObj, amount, note) {
    if (payTogglingId) return
    const isSettled = bookingObj.payment_status === "confirmed" || bookingObj.payment_status === "partial"
    const next = isSettled ? "pending" : "confirmed"
    setPayTogglingId(bookingObj.id)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: event.id, action: "set_payment", booking_id: bookingObj.id, payment_status: next,
        ...(next === "confirmed" ? { amount: amount === "" ? undefined : amount, note: note || undefined } : {}),
      }),
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      const resultLabel = data.payment_status === "partial" ? "Partial payment recorded"
        : data.payment_status === "confirmed" ? "Marked as paid" : "Marked as unpaid"
      showToast?.(resultLabel)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast?.(data.error || "Update failed")
    }
    await loadPaymentData()
    setPayTogglingId(null)
  }

  async function handleCloseOutPayments() {
    if (closingOutPayments) return
    setClosingOutPayments(true)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action: "close_out_payments" }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      showToast?.(data.reminded > 0 ? `Reminded ${data.reminded} unpaid attendee${data.reminded !== 1 ? "s" : ""}` : "All paid up -- nothing to remind")
    } else {
      showToast?.(data.error || "Close Out failed")
    }
    await loadPaymentData()
    setClosingOutPayments(false)
  }

  async function handleRemindPayment(bookingObj, name) {
    if (remindingPaymentId) return
    setRemindingPaymentId(bookingObj.id)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action: "remind_payment", booking_id: bookingObj.id }),
    })
    setRemindingPaymentId(null)
    if (res.ok) {
      setRemindedPaymentId(bookingObj.id)
      setTimeout(() => setRemindedPaymentId(null), 2500)
      showToast?.(`Reminder sent to ${name}`)
    } else {
      const data = await res.json().catch(() => ({}))
      showToast?.(data.error || "Could not send reminder")
    }
    await loadPaymentData()
  }

  async function handleToggleRefund(bookingObj, name, currentlyRefunded) {
    if (togglingRefundId) return
    setTogglingRefundId(bookingObj.id)
    const res = await authedFetch("/api/coordinator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action: "mark_refund_paid", booking_id: bookingObj.id, refunded: !currentlyRefunded }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      showToast?.(currentlyRefunded ? `Refund unmarked for ${name}` : `Refund marked for ${name}`)
    } else {
      showToast?.(data.error || "Failed to update refund")
    }
    await loadPaymentData()
    setTogglingRefundId(null)
  }

  // Derived payment values for the Attendees accordion (2026-09-22 port) --
  // sourced from paymentData (loaded via loadPaymentData() above), not the
  // separate `attendees` state, since only /api/coordinator's response
  // carries payment_status/amount_paid/refund fields. Looked up per-row by
  // booking id below so the existing attendee row rendering (name/car/bring/
  // book-return) doesn't need restructuring.
  const paymentByBookingId = {}
  for (const b of (paymentData?.bookings || [])) paymentByBookingId[b.id] = b
  const confirmedPayBookings = (paymentData?.bookings || []).filter(b => b.status === "confirmed")
  const refundPendingBookings = paymentData?.refund_pending || []
  const refundIssuedBookings  = paymentData?.refund_issued || []
  const paymentSummaryData = canManageBooks && isPaidEvent && paymentData
    ? paymentSummary(confirmedPayBookings, event, refundPendingBookings)
    : null
  const isPaymentsStale = canManageBooks && isPaidEvent && paymentData
    ? reconciliationIsStale({ ...event, payments_reconciled_at: paymentData.payments_reconciled_at },
        [...confirmedPayBookings, ...refundPendingBookings, ...refundIssuedBookings])
    : false
  const payeeName = (b) => b.members?.id === member?.id ? "You"
    : b.members
      ? resolveMemberName({ ...b.members, hide_name: !!(b.members?.hide_name || b.name_hidden) },
          { viewerId: member?.id, canManage: canManageBooks, selfLabel: "You", fallback: b.members?.username || b.contacts?.name || "Member" })
      : (b.contacts?.name || "Member")

  const isJoined = booking?.status === "confirmed"
  const isWaitlisted = booking?.status === "waitlist" || !!myWaitlist
  const myWaitlistSeats = myWaitlist?.seats || (booking?.status === "waitlist" ? (booking.seats || 1) : 0)
  // Bug fixed 2026-08-21 (Iain): see BookingStrip below. canManageBooks
  // (isAdmin || isEC || isOwner, computed above) doubles as the Owner/EC/
  // Admin bypass -- same permission shape already used for attendee
  // management on this card, no need for a second variable.
  const closed  = bookingsClosed(event)
  const blocked = closed && !isJoined && !isWaitlisted && !canManageBooks

  // Event Deep Linking + Add to Calendar (Iain, 2026-09-15 correction): Add
  // to Calendar sits on the Coordinators line, Copy Link directly below --
  // computed once here since this club's event may or may not render a
  // book section (the only place EventCoordinators currently shows for
  // this card) below.
  const shareEvWindow = resolveEventWindow(event)
  const shareUrl = club?.slug ? buildShareUrl(`/clubs/${club.slug}`, event.id) : null
  const shareLocation = event.location ? (event.location_type === "offsite" ? event.location.split("\n")[0] : event.location) : null
  const shareCalendarBtn = shareUrl && shareEvWindow && (
    <AddToCalendarButton url={shareUrl} title={event.title} description={event.description}
      location={shareLocation} start={shareEvWindow.start} end={shareEvWindow.end} colour={colour} />
  )

  return (
    <div onClick={blocked ? undefined : onOpen}
      style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
        overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 16, cursor: blocked ? "default" : "pointer" }}>
      {/* Card header */}
      {/* Accessibility fix (2026-08-31): this row used to have no flexWrap and
          no shrink/ellipsis protection on {label}, so at larger OS text-size
          settings the row's total content width could exceed the card, and
          because app/globals.css sets html{overflow-x:hidden} app-wide, the
          overflow wasn't scrollable -- it just silently clipped the Edit
          button off-screen with no way to reach it (reported live: a resident
          on a phone with larger accessibility text couldn't see or tap Edit
          in a club). minWidth:0+ellipsis keeps the common case unchanged;
          flexWrap is the belt-and-braces fallback so Edit drops to its own
          line rather than vanishing if it still doesn't fit. */}
      <div style={{ background: colour, padding: "0.6rem 1rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "4px 8px" }}>
        <span style={{ color: clubTextOn(colour), fontWeight: 700, fontSize: "0.85rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" }}>{label}</span>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "4px 8px", minWidth: 0 }}>
          <span style={{ color: clubTextOn(colour), opacity: 0.85, fontSize: "0.78rem", fontWeight: 600 }}>{fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ""}</span>
          {onEdit && (isAdmin || isOwner || isEC) && (
            <button onClick={(e) => { e.stopPropagation(); onEdit() }}
              style={{ background: "rgba(255,255,255,0.9)", color: clubInk(colour), border: "none", borderRadius: 14,
                padding: "3px 12px", fontWeight: 700, fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}>✎ Edit</button>
          )}
        </span>
      </div>

      {/* Event image — the theme cue; same focal-point treatment as Social */}
      {event.image_url && (
        <img src={event.image_url} alt={event.title}
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block",
            objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 50}%` }} />
      )}

      {/* Full rebuild to Iain's explicit numbered spec (2026-09-15, after
          the previous "unified block" attempt still conflated event name
          and book title into one line and buried Coordinators inside the
          book cover's own column). Confirmed against his own mockup
          screenshots and exact wording before touching anything -- this
          is not a guess at intent:

          1. Event name -- its own line, always, independent of book state.
             Root cause of the old bug ("Event Title only appears when
             Book title is Not Yet Selected... Event Title is missing when
             its a real book"): the old code showed EITHER event.title OR
             book.title on one shared line, never both -- so a real book
             hid the event name entirely, and choosing "Not selected yet"
             swapped in event.title only if set, otherwise silently showed
             the book placeholder with no text at all. Event name is now
             its own unconditional line, decoupled from book state.
          2. Location -- its own line, directly under the event name.
          3. Book block (book-capable clubs only) -- cover image, then
             title (real title, or literally "Not selected yet" -- never
             falls back to event.title now that event name has its own
             line above) / author / rating chips.
          4. Coordinator + Add to Calendar + Copy Link -- its own
             full-width section, NOT nested inside the book cover's flex
             column. Root cause of "Coordinator content always sits UNDER
             the image for the book": EventCoordinators used to live
             inside the same flex item as the book title/author/rating,
             to the right of the 56px cover -- so it inherited that
             column's indent and read as attached to/hanging off the
             book image instead of being its own section.
          5. Event description (event.description).
          6. Book details (book.summary) -- unchanged position from
             before, kept directly after the event description.
          7. Show attendees toggle -- unchanged.
          8. Booking status strip -- unchanged (BookingStrip, further
             down the component, already renders last). */}
      <div style={{ padding: "0.9rem 1rem 0.7rem", borderBottom: "1px solid var(--border)" }}>
        {/* 1. Event name */}
        {event.title && (
          <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, marginBottom: 4, color: "var(--text)" }}>
            {event.title}
          </div>
        )}

        {/* 2. Location */}
        {shareLocation && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: event.title || shareLocation ? 10 : 0 }}>
            📍 {shareLocation}
          </div>
        )}

        {/* 3. Book block -- book-capable clubs only */}
        {caps.hasBooks && (
          <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
            {book?.cover_url ? (
              bookLink
                ? <a href={bookLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <img src={book.cover_url} alt={book.title}
                      style={{ width: 56, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0, display: "block" }} />
                  </a>
                : <img src={book.cover_url} alt={book.title}
                    style={{ width: 56, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
            ) : (
              // Book placeholder -- keeps the cover slot (and therefore the
              // row's height/alignment) identical whether or not a book has
              // been chosen yet, rather than the row collapsing/reflowing.
              <div aria-hidden style={{ width: 56, height: 80, borderRadius: 6, flexShrink: 0,
                background: colour + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>
                📖
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {book ? (
                bookLink
                  ? <a href={bookLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2, color: "var(--text)", textDecoration: "none", display: "block" }}>
                      {book.title}
                    </a>
                  : <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2 }}>{book.title}</div>
              ) : (
                <div style={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2, marginBottom: 2, color: "var(--text-dim)" }}>
                  Not selected yet
                </div>
              )}
              {book && (
                <>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: 4 }}>{book.author && `by ${book.author}`}{book.published_year ? ` (${book.published_year})` : ""}</div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ background: "rgba(180,150,0,0.15)", color: "var(--amber-dark)", fontWeight: 700,
                      fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap" }}>
                      ⭐ {book.rating ?? "—"}
                    </span>
                    <span style={{ background: colour + "1f", color: clubInk(colour), fontWeight: 700,
                      fontSize: "0.68rem", padding: "0.15rem 0.55rem", borderRadius: 20, whiteSpace: "nowrap" }}>
                      {communityScore ?? "—"} ({voteCount})
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 4. Coordinator + Add to Calendar + Copy Link -- own full-width
            section, not nested inside the book cover's column */}
        {ecNames.length > 0 ? (
          <EventCoordinators eventId={event.id} eventTitle={event.title} names={ecNames}
            colour={colour} stackNames trailing={shareCalendarBtn} />
        ) : shareCalendarBtn ? (
          <div>{shareCalendarBtn}</div>
        ) : null}
        {shareUrl && shareEvWindow && (
          <div style={{ marginTop: "0.15rem", textAlign: "right" }}>
            <CopyLinkButton url={shareUrl} colour={colour} />
          </div>
        )}
      </div>

      <div style={{ padding: "0.9rem 1rem 0.6rem" }}>
        {/* 5. Event description */}
        {event.description && (
          <div style={{ marginBottom: 10 }}>
            <ExpandableText
              text={bbToHtml(event.description, colour)}
              html
              fontSize={13.6}
              lineHeight={1.5}
              maxLines={2}
              colour={colour}
            />
          </div>
        )}

        {/* Book summary -- was a bespoke fade+button duplicate of
            ExpandableText with its "Show more" pulled out into a separate
            left-aligned row below (Iain, 2026-09-15, screenshot #2: "Show
            More as is elsewhere throughout the system, is in centre aligned
            in the faded row of text"). Routed through the same shared
            ExpandableText this card already uses for Event notes two blocks
            up, so the toggle renders centred inside the fade exactly like
            every other truncated-text block in the app. */}
        {book?.summary && (
          <div style={{ marginBottom: 4 }}>
            <ExpandableText
              text={book.summary}
              fontSize={13.1}
              lineHeight={1.6}
              maxLines={3}
              colour={colour}
            />
          </div>
        )}

        {/* Show attendees row -- meaningless on an "open, all welcome"
            event (no bookings ever exist), so it's hidden entirely rather
            than opening to an empty list. */}
        {event.booking_required !== false && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", paddingTop: 4, paddingBottom: 2 }}>
            <button onClick={e => { e.stopPropagation(); toggleAttendees() }} disabled={attendeesLoading}
              style={{ background: "none", border: "none", color: clubInk(colour), fontSize: "0.78rem",
                fontWeight: 700, cursor: attendeesLoading ? "wait" : "pointer", padding: "2px 0", fontFamily: "inherit" }}>
              {attendeesLoading ? "Loading…" : attendeesOpen ? "Hide attendees ▲" : "Show attendees ▼"}
            </button>
          </div>
        )}

        {/* EC-only dish breakdown, grouped by category (Iain 2026-07-18) */}
        {attendeesOpen && canManageBooks && caps.bringEnabled && attendees && (() => {
          const groups = {}
          for (const a of attendees) {
            if (a.bring) (groups[a.bring] = groups[a.bring] || []).push({ name: a.name === "You" ? "You" : a.name, note: a.bringNote })
            for (const p of (a.party || [])) if (p.bring) (groups[p.bring] = groups[p.bring] || []).push({ name: p.name, note: p.bringNote })
          }
          const cats = Object.keys(groups)
          if (!cats.length) return null
          return (
            <div style={{ marginTop: 6, background: colour + "12", borderRadius: 10, padding: "0.5rem 0.8rem 0.6rem" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: clubInk(colour), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>What&apos;s coming</div>
              {cats.map(cat => (
                <div key={cat} style={{ fontSize: "0.78rem", color: "var(--text)", marginBottom: 2, lineHeight: 1.45 }}>
                  <strong>{cat}</strong> ({groups[cat].length}): <span style={{ color: "var(--text-dim)" }}>{groups[cat].map(g => g.note ? `${g.note} (${g.name})` : g.name).join(", ")}</span>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Attendees list */}
        {attendeesOpen && (
          <div style={{ marginTop: 6, background: "var(--surface2)", borderRadius: 10, padding: "0.4rem 0.8rem 0.5rem" }}>
            {canManageBooks && attendees && attendees.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.3rem" }}>
                <button onClick={e => { e.stopPropagation(); handleExportAttendees() }}
                  style={{ fontSize: "0.68rem", fontWeight: 700, color: clubInk(colour), background: "none",
                    border: `1px solid ${colour}`, borderRadius: 8, padding: "0.2rem 0.5rem", cursor: "pointer", fontFamily: "inherit" }}>
                  ⬇ Export PDF
                </button>
              </div>
            )}
            {/* Payment summary card (2026-09-22 port from Social's events
                page) -- Expected/Collected/Outstanding, Last reviewed +
                stale flag, Close Out, Export Reconciliation PDF. Gated the
                same way as every other payment-management element on this
                card: canManageBooks && isPaidEvent, plus paymentSummaryData
                itself only computes once paymentData has loaded. */}
            {paymentSummaryData && (
              <div onClick={e => e.stopPropagation()} style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "0.6rem 0.7rem", marginBottom: "0.6rem", fontSize: "0.75rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem",
                  marginBottom: paymentData?.payments_reconciled_at || paymentSummaryData.unpaidCount > 0 || paymentSummaryData.refundsDueCount > 0 ? "0.5rem" : 0 }}>
                  <span style={{ color: "var(--text-dim)" }}>Expected <strong style={{ color: "var(--text)" }}>${paymentSummaryData.expectedTotal.toFixed(2)}</strong></span>
                  <span style={{ color: "var(--text-dim)" }}>Collected <strong style={{ color: "var(--green)" }}>${paymentSummaryData.collectedTotal.toFixed(2)}</strong></span>
                  <span style={{ color: "var(--text-dim)" }}>Outstanding <strong style={{ color: paymentSummaryData.outstandingTotal > 0 ? "var(--amber-dark)" : "var(--text)" }}>${paymentSummaryData.outstandingTotal.toFixed(2)}</strong></span>
                  {paymentSummaryData.refundsDueCount > 0 && (
                    <span style={{ color: "var(--text-dim)" }}>Refunds due <strong style={{ color: "#92400e" }}>${paymentSummaryData.refundsDueTotal.toFixed(2)}</strong></span>
                  )}
                </div>
                {paymentData?.payments_reconciled_at && (
                  <div style={{ fontSize: "0.68rem", color: isPaymentsStale ? "var(--amber-dark)" : "var(--text-dim)", marginBottom: paymentSummaryData.unpaidCount > 0 ? "0.5rem" : 0 }}>
                    Last reviewed {fmtDate(paymentData.payments_reconciled_at.slice(0, 10))}
                    {paymentData.reconciled_by_member && ` by ${paymentData.reconciled_by_member.name || paymentData.reconciled_by_member.username}`}
                    {isPaymentsStale && <strong> — new activity since, worth another look</strong>}
                  </div>
                )}
                {paymentSummaryData.submittedCount > 0 && (
                  <div style={{ fontSize: "0.68rem", color: "#0f766e", marginBottom: "0.5rem" }}>
                    🧾 {paymentSummaryData.submittedCount} of these marked payment submitted — check and confirm below
                  </div>
                )}
                {paymentSummaryData.partialCount > 0 && (
                  <div style={{ fontSize: "0.68rem", color: "#075985", marginBottom: "0.5rem" }}>
                    {paymentSummaryData.partialCount} partial payment{paymentSummaryData.partialCount !== 1 ? "s" : ""} (${paymentSummaryData.partialTotal.toFixed(2)} received so far) — still short of the full amount
                  </div>
                )}
                {paymentSummaryData.unpaidCount > 0 && (
                  <button
                    disabled={closingOutPayments}
                    onClick={handleCloseOutPayments}
                    style={{
                      width: "100%", padding: "0.4rem", borderRadius: 8, border: "1px solid var(--amber)",
                      background: "var(--amber)15", color: "var(--amber-dark)", fontSize: "0.72rem", fontWeight: 700,
                      cursor: closingOutPayments ? "default" : "pointer", fontFamily: "inherit", opacity: closingOutPayments ? 0.6 : 1,
                      marginBottom: "0.4rem",
                    }}>{closingOutPayments ? "Closing out…" : `Close Out — remind ${paymentSummaryData.unpaidCount} unpaid`}</button>
                )}
                <button onClick={e => { e.stopPropagation(); handleExportReconciliation() }}
                  style={{ fontSize: "0.68rem", fontWeight: 700, color: clubInk(colour), background: "none",
                    border: `1px solid ${colour}`, borderRadius: 8, padding: "0.2rem 0.5rem", cursor: "pointer", fontFamily: "inherit" }}>
                  ⬇ Export Reconciliation PDF
                </button>
              </div>
            )}
            {attendees && attendees.length > 0 ? (
              attendees.map((a, i) => {
                const payBooking = paymentByBookingId[a.id]
                const paid = payBooking ? isPaymentPaid(payBooking) : false
                const partial = payBooking ? isPaymentPartial(payBooking, event) : false
                const submitted = !paid && payBooking ? isPaymentSubmitted(payBooking) : false
                const balanceNum = payBooking ? remainingBalance(payBooking, event, payBooking.seats || a.seats || 1) : 0
                const isRecording = recordingId === a.id
                return (
                <div key={a.id || i} style={{ padding: "0.3rem 0",
                  borderBottom: i < attendees.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {/* One person per line; dish in the club colour; fades if it
                        doesn't fit (Iain 2026-07-18 — colour is the lead, no icon). */}
                    <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: a.isOwn ? 700 : 400, color: a.isOwn ? colour : "var(--text)" }}>
                      {a.name}
                      {a.isPrivate && canManageBooks && !a.isOwn && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>(P)</span>}
                      {a.busPassenger && <span title="Riding the bus" style={{ marginLeft: 4 }}><BusIcon style={{ width: 12, height: 12, verticalAlign: "-1px", opacity: 0.75 }} /></span>}
                      {a.carStatus?.role === "driving" && (
                        <span title={`Driving -- offering ${a.carStatus.seatsOffered} seat${a.carStatus.seatsOffered === 1 ? "" : "s"}`} style={{ marginLeft: 4, fontSize: "0.72rem" }}>🚗 Driving</span>
                      )}
                      {a.carStatus?.role === "riding" && (
                        <span title={`In ${a.carStatus.driverName}'s car`} style={{ marginLeft: 4, fontSize: "0.72rem" }}>🧍 In {a.carStatus.driverName}'s car</span>
                      )}
                      {a.bring && <span style={{ fontWeight: 600, color: clubInk(colour) }}> · {a.bring}{a.bringNote ? ` — ${a.bringNote}` : ""}</span>}
                    </span>
                    {/* Nested passenger list under the driver's own row
                        (Iain, follow-up on PR #145/#147): a car icon marks
                        the driver above, a human icon marks each passenger
                        here, indented under the driver rather than appearing
                        as separate rows. */}
                    {a.drivingPassengers.length > 0 && (
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 2, marginLeft: 10, borderLeft: "2px solid var(--border)", paddingLeft: 6 }}>
                        {a.drivingPassengers.map((p, i) => (
                          <div key={i}>🧍 {p.name}{p.guest ? " (guest)" : ""}</div>
                        ))}
                      </div>
                    )}
                    {(a.party || []).map((p, j) => (
                      <span key={j} style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                        {p.name}{p.guest ? " (guest)" : ""}
                        {p.busPassenger && <span title="Riding the bus" style={{ marginLeft: 4 }}><BusIcon style={{ width: 11, height: 11, verticalAlign: "-1px", opacity: 0.75 }} /></span>}
                        {p.bring && <span style={{ color: clubInk(colour), fontWeight: 600 }}> · {p.bring}{p.bringNote ? ` — ${p.bringNote}` : ""}</span>}
                      </span>
                    ))}
                  </span>
                  {canManageBooks && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {a.hasBook && (
                        <button
                          onClick={e => { e.stopPropagation(); remindBookReturn(a.id, a.name) }}
                          disabled={remindingId === a.id}
                          title="Remind to return book"
                          aria-label={`Remind ${a.name} to return their book`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none",
                            padding: "0.1rem 0.15rem", cursor: remindingId === a.id ? "default" : "pointer", fontFamily: "inherit",
                            flexShrink: 0, opacity: remindingId === a.id ? 0.35 : 1, fontSize: "0.85rem", lineHeight: 1 }}>
                          {remindedId === a.id ? "✅" : "🔔"}
                        </button>
                      )}
                      {caps.hasBookReturn && (
                      <div onClick={e => { e.stopPropagation(); toggleHasBook(a.id, a.hasBook) }} role="switch" aria-checked={a.hasBook}
                        title={a.hasBook ? "Mark as returned" : "Mark book as given out"}
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: togglingId === a.id ? "wait" : "pointer", opacity: togglingId === a.id ? 0.6 : 1 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: a.hasBook ? colour : "var(--text-dim)" }}>{a.hasBook ? "Has Book" : a.bookGivenAt ? "Returned" : "No Book"}</span>
                        <div style={{ position: "relative", width: 36, height: 20, borderRadius: 10,
                          background: a.hasBook ? colour : "var(--border)", transition: "background 0.2s", flexShrink: 0 }}>
                          <span style={{ position: "absolute", top: 2, left: a.hasBook ? 18 : 2, width: 16, height: 16,
                            borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                        </div>
                      </div>
                      )}
                      {isPaidEvent && payBooking && !paid && (() => {
                        const reminding = remindingPaymentId === a.id
                        const remindedToday = isRemindedToday(payBooking)
                        const disabled = reminding || remindedToday
                        return (
                          <button
                            disabled={disabled}
                            onClick={e => { e.stopPropagation(); if (!disabled) handleRemindPayment(payBooking, a.name) }}
                            aria-label={remindedToday ? `Already reminded ${a.name} today` : `Remind ${a.name} to pay`}
                            title={remindedToday ? "Reminder already sent today" : "Send payment reminder"}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none",
                              padding: "0.1rem 0.15rem", cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
                              flexShrink: 0, opacity: reminding ? 0.35 : remindedToday ? 0.4 : 1, fontSize: "0.85rem", lineHeight: 1,
                              filter: remindedToday ? "grayscale(1)" : "none" }}>
                            {remindedPaymentId === a.id ? "✅" : "🔔"}
                          </button>
                        )
                      })()}
                      {isPaidEvent && payBooking && (() => {
                        const pending = payTogglingId === a.id
                        return (
                          <button
                            disabled={pending}
                            onClick={e => {
                              e.stopPropagation()
                              setRecordingId(a.id)
                              setRecordAmount(String(Math.round(balanceNum)))
                              setRecordNote("")
                              setResetConfirmId(null)
                            }}
                            role="switch" aria-checked={paid} aria-label={paid || partial ? "Adjust recorded payment" : "Record a payment"}
                            style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none",
                              padding: "0.15rem 0.1rem", cursor: pending ? "default" : "pointer", fontFamily: "inherit",
                              flexShrink: 0, opacity: pending ? 0.55 : 1 }}>
                            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: partial ? "#0369a1" : !paid ? "var(--amber-dark)" : "var(--text-dim)" }}>Unpaid</span>
                            <span style={{ width: 32, height: 18, borderRadius: 9, position: "relative", flexShrink: 0,
                              background: paid ? "var(--green)" : partial ? "#0369a1" : "var(--amber)", transition: "background 0.15s" }}>
                              <span style={{ position: "absolute", top: 2, left: paid ? 16 : 2, width: 14, height: 14, borderRadius: "50%",
                                background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
                            </span>
                            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: paid ? "var(--green)" : "var(--text-dim)" }}>Paid</span>
                          </button>
                        )
                      })()}
                    </div>
                  )}
                </div>
                {canManageBooks && submitted && (
                  <div style={{ marginTop: "0.15rem" }}>
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#0f766e", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8, padding: "0.05rem 0.35rem" }}>🧾 Submitted</span>
                  </div>
                )}
                {/* Inline record-payment form (2026-09-22 port) -- amount
                    pre-filled to the outstanding balance, comment required
                    only if the amount doesn't complete it. The server
                    derives Partial/Confirmed from the amount -- this never
                    sends a status directly. */}
                {canManageBooks && isRecording && (() => {
                  const owed = payBooking ? seatsCost(event, payBooking.seats || a.seats || 1) : null
                  const enteredAmt = recordAmount === "" ? null : (parseFloat(recordAmount) || 0)
                  const willComplete = enteredAmt !== null && Math.round(enteredAmt) === Math.round(balanceNum)
                  const commentNeeded = !willComplete
                  const pending = payTogglingId === a.id
                  const saveBlocked = commentNeeded && !recordNote.trim()
                  const saveDisabled = pending || saveBlocked
                  return (
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: "0.4rem", padding: "0.5rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Amount received</span>
                      <input type="number" min="0" step="1" value={recordAmount} onChange={e => setRecordAmount(e.target.value)}
                        style={{ width: 90, padding: "0.3rem 0.5rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.8rem", boxSizing: "border-box", fontFamily: "inherit" }} />
                      <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>of {wholeDollar(balanceNum)} balance</span>
                    </div>
                    {partial && owed && (
                      <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Completes {owed} total</div>
                    )}
                    <textarea placeholder={willComplete ? "Comment (optional)" : "Comment (required — amount doesn't complete the balance owed)"}
                      value={recordNote} onChange={e => setRecordNote(e.target.value)} rows={2}
                      style={{ width: "100%", padding: "0.4rem 0.5rem", borderRadius: 8, border: `1px solid ${saveBlocked ? "var(--red, #dc2626)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: "0.78rem", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                    {saveBlocked && (
                      <div style={{ fontSize: "0.68rem", color: "var(--red, #dc2626)", fontWeight: 600 }}>
                        ⚠ Add a comment before saving — the amount doesn't complete the balance owed.
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button onClick={() => { setRecordingId(null); setResetConfirmId(null) }} style={{ flex: 1, padding: "0.35rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                      <button
                        disabled={saveDisabled}
                        title={saveBlocked ? "Add a comment before saving — the amount doesn't complete the balance owed." : undefined}
                        onClick={() => {
                          if (saveBlocked) return
                          handleTogglePayment(payBooking, recordAmount, recordNote); setRecordingId(null)
                        }}
                        style={{ flex: 1, padding: "0.35rem", borderRadius: 8, border: "none", background: saveDisabled ? "var(--surface2)" : colour, color: saveDisabled ? "var(--text-dim)" : "#fff", cursor: saveDisabled ? "not-allowed" : "pointer", opacity: saveDisabled ? 0.6 : 1, fontSize: "0.75rem", fontWeight: 700, fontFamily: "inherit" }}>Save</button>
                    </div>
                    {(paid || partial) && (
                      resetConfirmId === a.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.1rem" }}>
                          <span style={{ fontSize: "0.68rem", color: "var(--amber-dark)", flex: 1 }}>
                            Clear the {wholeDollar(payBooking?.amount_paid)} on file and mark unpaid?
                          </span>
                          <button onClick={() => setResetConfirmId(null)}
                            style={{ fontSize: "0.68rem", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>No</button>
                          <button
                            onClick={() => { handleTogglePayment(payBooking); setResetConfirmId(null); setRecordingId(null) }}
                            style={{ fontSize: "0.68rem", fontWeight: 700, background: "none", border: "none", color: "var(--amber-dark)", cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" }}>
                            Yes, reset
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setResetConfirmId(a.id)}
                          style={{ fontSize: "0.68rem", color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", textDecoration: "underline" }}>
                          Reset to unpaid
                        </button>
                      )
                    )}
                  </div>
                  )
                })()}
                </div>
                )
              })
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic" }}>No attendees yet</div>
            )}
            {isAdmin && waitlistRows.length > 0 && (
              <>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "0.5rem", marginBottom: "0.15rem" }}>Waitlist</div>
                {waitlistRows.map(b => {
                  const isOwn = b.member_id === member?.id
                  const isPrivate = !!b.members?.hide_name
                  // Admin-only block, so real name + (P) marker, no masking --
                  // same rule as Social/Special Events' Waitlist list.
                  const name = isOwn ? "You" : (b.members?.name || b.members?.username || b.contacts?.name || "Member")
                  return (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.2rem 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontWeight: isOwn ? 700 : 400, color: isOwn ? colour : "var(--text)" }}>
                        <span style={{ color: "var(--amber-dark)", fontWeight: 700, marginRight: 5 }}>({ordinal(b.position)})</span>
                        {name}
                        {isPrivate && !isOwn && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-dim)", marginLeft: 4 }}>(P)</span>}
                      </span>
                      <span style={{ color: "var(--text-dim)" }}>{b.seats || 1} place{(b.seats || 1) !== 1 ? "s" : ""}</span>
                    </div>
                  )
                })}
              </>
            )}
            {/* Refunds Due / Refunds Issued (2026-09-22 port from Social's
                events page, itself ported from Movies/Book Club's
                Coordinator panel -- same mark_refund_paid action). */}
            {canManageBooks && isPaidEvent && refundPendingBookings.length > 0 && (
              <div style={{ background: "#fef3c7", borderRadius: 10, padding: "0.6rem 0.7rem", border: "1px solid #d97706", marginTop: "0.6rem" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#92400e", marginBottom: "0.4rem" }}>⚠️ Refunds Due ({refundPendingBookings.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {refundPendingBookings.map(b => {
                    const label = payeeName(b)
                    const isPrivate = !!(b.members?.hide_name || b.name_hidden)
                    const isOwn = b.members?.id === member?.id
                    const total = seatsCost(event, b.seats || 1)
                    const pending = togglingRefundId === b.id
                    return (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e" }}>
                            {label}
                            {isPrivate && canManageBooks && !isOwn && <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#92400e", opacity: 0.7, marginLeft: 4 }}>(P)</span>}
                          </span>
                          <span style={{ fontSize: "0.68rem", color: "#d97706", marginLeft: 6 }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                        </div>
                        <button
                          disabled={pending}
                          onClick={e => { e.stopPropagation(); handleToggleRefund(b, label, false) }}
                          style={{ fontSize: "0.68rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: 8, border: "1px solid #d97706", background: "none", color: "#d97706", cursor: pending ? "default" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit", opacity: pending ? 0.6 : 1 }}>
                          {pending ? "…" : "Mark Refunded"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {canManageBooks && isPaidEvent && refundIssuedBookings.length > 0 && (
              <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "0.6rem 0.7rem", border: "1px solid var(--border)", marginTop: "0.6rem" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem" }}>✓ Refunds Issued ({refundIssuedBookings.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {refundIssuedBookings.map(b => {
                    const label = payeeName(b)
                    const isPrivate = !!(b.members?.hide_name || b.name_hidden)
                    const isOwn = b.members?.id === member?.id
                    const total = seatsCost(event, b.seats || 1)
                    const pending = togglingRefundId === b.id
                    return (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <span style={{ fontSize: "0.76rem", color: "var(--text-dim)", fontWeight: isOwn ? 700 : 400 }}>
                            {label}
                            {isPrivate && canManageBooks && !isOwn && <span style={{ fontWeight: 700, marginLeft: 4 }}>(P)</span>}
                          </span>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginLeft: 6 }}>{b.seats || 1} seat{(b.seats||1) > 1 ? "s" : ""}{total ? ` · ${total}` : ""}</span>
                        </div>
                        <button
                          disabled={pending}
                          onClick={e => { e.stopPropagation(); handleToggleRefund(b, label, true) }}
                          style={{ fontSize: "0.65rem", color: "var(--text-dim)", background: "none", border: "none", cursor: pending ? "default" : "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                          {pending ? "…" : "Unmark"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking status strip */}
      <BookingStrip isJoined={isJoined} isWaitlisted={isWaitlisted} waitlistSeats={myWaitlistSeats} waitlistPosition={waitlistInfo?.position || null} seats={booking?.seats || 1} hasBook={!!booking?.has_book} bookReturnDate={event?.book_return_date} closed={closed} blocked={blocked} open={event.booking_required === false} colour={colour} />

    </div>
  )
}

// ── Closed Events Accordion ───────────────────────────────────────────────────
function UpcomingDatesAccordion({ events, myBookings, waitlistInfo = {}, onOpen, onEdit = null, colour = "var(--purple)", club = null }) {
  const { member, isAdmin } = useUser()
  const { owners: accordionOwners } = useOwners("club", club?.id)
  const isOwner = !!member?.id && accordionOwners.some(o => o.id === member.id)
  const [open, setOpen] = useState(false)
  if (!events.length) return null
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", margin: "-4px 0 16px 12px" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "0.75rem 1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-dim)" }}>📅 Upcoming dates ({events.length})</span>
        <span style={{ color: "var(--text-dim)", fontSize: "1rem", display: "inline-block",
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.4rem 0.5rem" }}>
          {events.map(ev => {
            // A waitlist row used to read "✓ Booked" here (BUG-067).
            const booked = myBookings[ev.id]?.status === "confirmed"
            const waitlisted = myBookings[ev.id]?.status === "waitlist"
            return (
              <div key={ev.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, borderBottom: "1px solid var(--border)" }}>
                <button onClick={() => onOpen(ev)}
                  style={{ flex: "1 1 auto", minWidth: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                    padding: "0.6rem 0.7rem", background: "none", border: "none", cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem", color: clubInk(colour) }}>{fmt(ev.event_date)}</span>
                    {ev.event_time && <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}> · {ev.event_time.slice(0,5)}</span>}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: "0.72rem", fontWeight: 700, color: booked ? "#15803d" : waitlisted ? "#d97706" : colour, whiteSpace: "nowrap" }}>{booked ? "✓ Booked" : waitlisted ? `⏳ ${waitlistLabel(waitlistInfo[ev.id]?.position)}` : "Book →"}</span>
                </button>
                {onEdit && (isAdmin || isOwner || (!!member && (ev.event_coordinators || []).some(ec => !ec.replaced_at && ec.member_id === member.id))) && (
                  <button onClick={() => onEdit(ev)} aria-label="Edit this date" title="Edit this date"
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: "0.72rem", fontWeight: 700, padding: "0.4rem 0.6rem", color: clubInk(colour), whiteSpace: "nowrap" }}>✎ Edit</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ClosedEventsAccordion({ events, myBookedIds, colour = "var(--purple)" }) {
  const [open, setOpen] = useState(false)
  if (!events.length) return null
  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>📖 Closed Events ({events.length})</span>
        <span style={{ color: "var(--text-dim)", fontSize: "1rem", display: "inline-block",
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1rem",
          display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {events.map(ev => {
            const book       = ev.books
            const participated = myBookedIds.has(ev.id)
            return (
              <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {book?.cover_url ? (
                  <img src={book.cover_url} alt={book.title}
                    style={{ width: 36, height: 52, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 52, borderRadius: 4, background: colour + "20",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.1rem" }}>📖</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", lineHeight: 1.2 }}>{book?.title || ev.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{book?.author && `by ${book.author}`}{book?.published_year ? ` (${book.published_year})` : ""}</div>
                  <div style={{ fontSize: "0.72rem", color: clubInk(colour), marginTop: 2 }}>{fmtYear(ev.event_date)}</div>
                  {participated && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                      background: "#dcfce7", color: "#15803d", borderRadius: 12, padding: "2px 8px",
                      fontSize: "0.72rem", fontWeight: 700 }}>✓ Participated</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Book Search (Google Books) ────────────────────────────────────────────────
// A pinned pseudo-choice, not a real book row (2026-09-15, Iain -- item #4:
// "need to be able to create events without knowing the book. Could be a
// placeholder in the choose book dropdown for 'Not Selected Yet'?"). Purely
// a display sentinel for BookPicker's own collapsed/open rendering --
// pick() always calls onSelect(null) for it, so every downstream consumer
// (book_id, book_snapshot, event title fallback) sees exactly what it
// already saw for "no book chosen at all". Nothing else needed to change.
const BOOK_NOT_SELECTED = { id: null, title: "Not selected yet", __notSelected: true }

// BookPicker — selects from books already in the community suggestions table
function BookPicker({ onSelect, initialBook, colour = "var(--purple)", invalid = false }) {
  const [allBooks, setAllBooks] = useState([])
  const [query,    setQuery]    = useState("")
  const [chosen,   setChosen]   = useState(initialBook || null)
  const [open,     setOpen]     = useState(!initialBook)

  useEffect(() => {
    async function loadBooks() {
      // we_own=false: this picker is for community-suggested books, never
      // the Book Library -- same missing filter as BookCatalogue.js's own
      // load() (fixed 2026-09-15, migration 106_clear_book_club_suggestions),
      // just not caught in that same pass since this is a separate
      // component/query. Confirmed via direct production query before
      // fixing: all 567 rows in `books` are we_own=true (Library); this
      // picker was rendering literally the whole Library with no filter at
      // all, which is also why the pinned "Not selected yet" row at the top
      // of the dropdown read as invisible/lost to Iain -- it was sitting
      // above a 567-title wall, not a short suggestions list.
      const { data: books } = await supabase.from("books").select("id, title, author, cover_url, published_year").eq("we_own", false).order("title")
      const ids = (books || []).map(b => b.id)
      const sums = {}, counts = {}
      if (ids.length) {
        const { data: votes } = await supabase.from("book_votes").select("book_id, score").in("book_id", ids)
        for (const v of votes || []) {
          sums[v.book_id]   = (sums[v.book_id]   || 0) + v.score
          counts[v.book_id] = (counts[v.book_id] || 0) + 1
        }
      }
      // Sort by community score (descending) so the organiser can see what's
      // actually winning without leaving this screen — was previously
      // alphabetical with no score shown at all. Unscored books sort last.
      const withScores = (books || []).map(b => ({
        ...b,
        avg_score:  counts[b.id] ? (sums[b.id] / counts[b.id]).toFixed(1) : null,
        vote_count: counts[b.id] || 0,
      })).sort((a, b) => {
        if (a.avg_score == null && b.avg_score == null) return a.title.localeCompare(b.title)
        if (a.avg_score == null) return 1
        if (b.avg_score == null) return -1
        return parseFloat(b.avg_score) - parseFloat(a.avg_score)
      })
      setAllBooks(withScores)
    }
    loadBooks()
  }, [])

  const filtered = allBooks.filter(b =>
    !query || b.title?.toLowerCase().includes(query.toLowerCase()) ||
    b.author?.toLowerCase().includes(query.toLowerCase())
  )

  function pick(b) {
    setChosen(b)
    setOpen(false)
    onSelect(b?.__notSelected ? null : b)
  }

  if (!open && chosen) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface2)",
        borderRadius: 10, padding: "0.65rem 0.9rem", marginBottom: 12 }}>
        {chosen.__notSelected ? (
          <div style={{ flex: 1, minWidth: 0, fontSize: "0.9rem", color: "var(--text-dim)", fontStyle: "italic" }}>📖 Not selected yet</div>
        ) : (
          <>
            {chosen.cover_url && <img src={chosen.cover_url} alt="" style={{ width: 36, height: 50, objectFit: "cover", borderRadius: 4 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{chosen.title}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{chosen.author && `by ${chosen.author}`}{chosen.published_year ? ` (${chosen.published_year})` : ""}</div>
            </div>
          </>
        )}
        <button onClick={() => { setChosen(null); setQuery(""); setOpen(true); onSelect(null) }}
          style={{ background: colour, color: clubTextOn(colour), border: "none", borderRadius: 8,
            padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        type="text"
        placeholder="Search community suggestions…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10, border: `1px solid ${colour}`,
          background: "var(--surface)", color: "var(--text)", fontSize: "1rem",
          boxSizing: "border-box", fontFamily: "inherit",
          ...(invalid ? { border: "2px solid #dc2626", background: "rgba(220, 38, 38, 0.10)" } : {}) }}
      />
      <div style={{ border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50, marginTop: 4,
        background: "var(--surface)", overflow: "hidden" }}>
        <div onClick={() => pick(BOOK_NOT_SELECTED)}
          style={{ padding: "0.7rem 1rem", cursor: "pointer", fontStyle: "italic",
            color: "var(--text-dim)", fontSize: "0.85rem", borderBottom: "1px solid var(--border)" }}>
          📖 Not selected yet
        </div>
        {allBooks.length === 0 ? (
            <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
              Loading books…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
              No matching books in suggestions
            </div>
          ) : filtered.map(b => (
            <div key={b.id} onClick={() => pick(b)}
              style={{ display: "flex", gap: 10, padding: "0.7rem 1rem", cursor: "pointer",
                borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              {b.cover_url && <img src={b.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.2 }}>{b.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}{b.published_year ? ` (${b.published_year})` : ""}</div>
              </div>
              {b.avg_score != null && (
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", background: "rgba(180,150,0,0.15)", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  ⭐ {b.avg_score}
                </span>
              )}
            </div>
          ))}
        </div>
      {allBooks.length > 0 && filtered.length === 0 && query.length === 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12,
          background: "var(--surface)", overflow: "hidden", marginTop: 4 }}>
          {allBooks.slice(0, 5).map(b => (
            <div key={b.id} onClick={() => pick(b)}
              style={{ display: "flex", gap: 10, padding: "0.7rem 1rem", cursor: "pointer",
                borderBottom: "1px solid var(--border)", alignItems: "center" }}>
              {b.cover_url && <img src={b.cover_url} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 3 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{b.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{b.author}{b.published_year ? ` (${b.published_year})` : ""}</div>
              </div>
              {b.avg_score != null && (
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--amber-dark)", background: "rgba(180,150,0,0.15)", padding: "0.15rem 0.5rem", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  ⭐ {b.avg_score}
                </span>
              )}
            </div>
          ))}
          {allBooks.length > 5 && (
            <div style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              Type to search {allBooks.length} books… (sorted by community score)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Coordinator Typeahead Picker ─────────────────────────────────────────────
// Styled toggle switch — matches Social's Toggle component exactly (app/(app)/social/events/page.js)
// so a boolean control looks identical across hubs, per this project's UI Standards
// (no native browser controls / cross-hub consistency). Added 2026-08-19 for Community Bus.
function Toggle({ value, onChange, label, colour = "var(--purple)" }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.75rem 1rem", background: "var(--surface2)",
      borderRadius: "10px", cursor: "pointer", userSelect: "none",
      border: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <div style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? colour : "var(--border)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  )
}

function CoordPicker({ members, value, onChange, valid = false, colour = "var(--purple)", invalid = false, placeholder = "— Select coordinator —" }) {
  const chosen = members.find(m => m.id === value) || null
  const [query,  setQuery]  = useState("")
  const [open,   setOpen]   = useState(false)
  const containerRef        = useRef(null)

  // display_name (2026-08-14): this picker is an admin/Owner responsible-party
  // action (assigning a club coordinator), so search matches EITHER name --
  // whoever's picking may only know one of the two -- while the option list
  // still shows the real name first (below), matching the confirmed rule
  // that responsible-party screens keep Real Name primary.
  const filtered = members.filter(m =>
    !query || [m.name, m.display_name, m.username].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const borderCol = open ? colour : valid ? "var(--green)" : "var(--danger)"
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setOpen(o => !o); setQuery("") }}
        role="button" tabIndex={0} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); setQuery("") } }}
        style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
          border: `1.5px solid ${borderCol}`, background: "var(--surface)",
          color: chosen ? "var(--text)" : "var(--text-dim)", fontSize: "0.95rem",
          boxSizing: "border-box", fontFamily: "inherit", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          ...(invalid ? { border: "2px solid #dc2626", background: "rgba(220, 38, 38, 0.10)" } : {}) }}>
        <span>{chosen ? (chosen.name || chosen.username) : placeholder}</span>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 60, overflow: "hidden" }}>
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search name…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: "100%", border: "none", background: "transparent",
                color: "var(--text)", fontSize: "1rem", outline: "none", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {value && (
              <div
                onClick={() => { onChange(""); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer", fontSize: "0.85rem",
                  color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                — Clear selection —
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                style={{ padding: "0.65rem 1rem", cursor: "pointer",
                  background: m.id === value ? colour + "12" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: m.id === value ? 700 : 400, fontSize: "0.88rem",
                  color: m.id === value ? colour : "var(--text)" }}>
                {m.name || m.username}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "0.9rem 1rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                No match
              </div>
            )}
            {members.length > 5 && !query && (
              <div style={{ padding: "0.5rem 1rem", fontSize: "0.72rem", color: "var(--text-dim)",
                borderTop: "1px solid var(--border)" }}>
                Type to search all {members.length} members
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hour picker — hour + AM/PM only (no minutes; Iain 2026-07-17) ────────────
// ── Bring-a-dish: pick which of the club's categories apply to THIS event ────
// The club defines the full list; each event chooses which are allowed, and an
// attendee booking only sees the allowed ones (Iain 2026-07-18).
// value === null means "all of them".
// Which of the club's bring categories apply to THIS event -- and separately,
// whether picking one is mandatory to book (see the Required toggle rendered
// by the caller). Iain, 2026-08-07: previously a null/blank selection here
// meant "every category applies" (and toggling every button back on
// collapsed the value back to null) -- so a club with bring_enabled on had
// NO way for an individual event to opt out of the requirement at all, and
// "not configured yet" and "deliberately applies to everything" were the
// same stored value. Now: nothing selected really means nothing selected --
// bring simply isn't relevant to this event, even though the club supports
// it and another event in the same club might use it.
function BringCategoryPicker({ clubId, colour, value, onChange }) {
  const [cats, setCats] = useState([])
  useEffect(() => {
    if (!clubId) return
    supabase.from("club_bring_categories").select("id, label, sort").eq("club_id", clubId).order("sort")
      .then(({ data }) => setCats(data || []))
  }, [clubId])

  if (!cats.length) {
    return <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>No categories set yet — add them in Admin &rsaquo; Clubs.</div>
  }
  const selected = Array.isArray(value) ? value : []
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
        {cats.map(c => {
          const on = selected.includes(c.id)
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)}
              style={{ borderRadius: 14, padding: "0.2rem 0.7rem", fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${on ? colour : "var(--border)"}`,
                background: on ? colour : "var(--surface)", color: on ? "#fff" : "var(--text-dim)" }}>
              {c.label}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
        {selected.length === 0
          ? "None selected — bringing something won't apply to this event."
          : "Tap to choose which apply to this event — attendees can pick one of these when they book."}
      </div>
    </div>
  )
}

// ── Admin Inline Event Form ───────────────────────────────────────────────────
function CoordMultiPicker({ members, value = [], onChange, colour = "var(--purple)", max = Infinity, invalid = false }) {
  const chosen = value.map(id => members.find(m => m.id === id)).filter(Boolean)
  const available = members.filter(m => !value.includes(m.id))
  return (
    <div>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {chosen.map(m => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface2)", border: `1px solid ${colour}`, borderRadius: 999, padding: "0.3rem 0.35rem 0.3rem 0.75rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              {m.name || m.username}
              <button type="button" onClick={() => onChange(value.filter(id => id !== m.id))} aria-label={`Remove ${m.name || m.username}`}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "1.15rem", height: "1.15rem", borderRadius: 999, border: "none", background: "var(--border)", color: "var(--text)", fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <CoordPicker members={available} value="" valid={value.length > 0} colour={colour} invalid={invalid}
        onChange={id => { if (id) onChange([...value, id]) }} />
    </div>
  )
}

function AdminEventForm({ event, members, onSave, onClose, club, clubPattern = null, colour = "var(--purple)" }) {
  const inputStyle = { width: "100%", padding: "0.75rem 1rem", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
    fontSize: "1rem", boxSizing: "border-box", fontFamily: "inherit",
    appearance: "none", WebkitAppearance: "none" }

  const caps = clubCaps(club)
  const onsiteLocations = useLocations()
  const activeEC = event ? (event.event_coordinators || []).find(ec => !ec.replaced_at) : null
  const todayStr = sydneyTodayStr()
  const nowHour  = String(new Date().getHours()).padStart(2, "0") + ":00"
  const [form,   setForm]   = useState({
    event_date:   event?.event_date || todayStr,
    event_time:   (event?.event_time || nowHour).slice(0, 5),
    event_end_time: event?.event_end_time ? event.event_end_time.slice(0, 5) : "",
    kit_return_date: event?.kit_return_date || "",
    book_return_date: event?.book_return_date || "",
    reservation_cutoff: cutoffToDateValue(event?.reservation_cutoff),
    max_seats:    event?.max_seats ?? 20,
    location_type: event?.location_type || "onsite",
    location:     event?.location || "",
    location_id:  event?.location_id || null,
    has_bus:      event?.has_bus || false,
    allow_personal_vehicles: event?.allow_personal_vehicles || false,
    bus_max_seats: event?.bus_max_seats ?? "",
    max_seats_per_booking: event?.max_seats_per_booking ?? 2,
    // "Open, all welcome" events (Iain, 2026-09-11 -- Groups & Clubs dry run):
    // no booking/RSVP at all, so no capacity, payment, or attendee-naming
    // policy applies. Defaults true (Requires booking) for both new and
    // existing events, matching the DB column's own default.
    booking_required: event?.booking_required !== false,
    allow_nonresident_guests: event ? !!event.allow_nonresident_guests : true, // new events default to "Anyone" (2026-07-25)
    require_attendee_names: !!event?.require_attendee_names,
    payment_required: event?.payment_required || false,
    cost:         event?.cost || "",
    payment_due_by: event?.payment_due_by || "",
    is_public:    event?.is_public !== false,
    show_attendee_names: event?.show_attendee_names !== false,
    title:        event?.title || "",
    bring_category_ids: event?.bring_category_ids || [],
    bring_required: !!event?.bring_required,
    theme_name:   event?.theme_name || "",
    description:  event?.description || "",
    welcome_message: event?.welcome_message || "",
    coordinator_ids: (event?.event_coordinators || []).filter(ec => !ec.replaced_at).map(ec => ec.member_id),
  })
  // bookable is a property of the room (migration 071), not a regex on its name.
  // Declared after `form` — referencing it above the useState is a TDZ error.
  const selectedLocation = onsiteLocations.find(l => l.id === form.location_id) || null
  const [selectedBook, setSelectedBook] = useState(event?.books || null)
  const [saving, setSaving] = useState(false)
  // Recurring events (scope §7a): schedule-defined clubs get a real series;
  // content-defined clubs get a pattern that only pre-fills the next date.
  // Only offered when creating, never when editing.
  //
  // CHANGED 2026-09-15 (Iain, item #5): Book Club used to be forced onto
  // "pattern" mode purely because hasBooks was true -- but that was never
  // actually how Book Club runs. Iain: "there is a set a meeting pattern
  // option but no option like other groups for REPEATS which is actually
  // how book club will work" -- the meeting SCHEDULE repeats regardless of
  // which book happens to be picked for a given occurrence, exactly like
  // every other club. hasBooks no longer forces pattern mode; only
  // oneEventAtATime does (a club that genuinely runs one thing at a time,
  // with no fixed future schedule to generate -- no live club currently
  // sets this flag, so this is a no-op for real clubs today and only
  // matters if one is configured this way in future).
  const recurMode = caps.oneEventAtATime ? "pattern" : "series"
  const [recur, setRecur] = useState(() => (!event && clubPattern)
    ? { enabled: true, rule_type: clubPattern.rule_type, rule_config: clubPattern.rule_config || {}, month_end_policy: clubPattern.month_end_policy || "clamp", horizon_months: clubPattern.horizon_months || 6 }
    : { enabled: false, rule_type: "weekly", rule_config: { weekdays: [] }, month_end_policy: "clamp", horizon_months: 6 })
  const isSeriesOccurrence = !!event?.series_id
  const [seriesRow, setSeriesRow] = useState(null)
  // Loading guard (2026-09-16, standing principle going forward -- see
  // CLAUDE.md's Coding Standards): the recurring-series edit block below
  // must not render its controls -- and Save must not be clickable -- until
  // the real saved series row has actually arrived. Previously the block
  // rendered immediately off `recur`'s hardcoded fallback state, which is
  // indistinguishable on screen from a genuinely-loaded "no repeat set"
  // series -- exactly what let the RLS-blocked read below go unnoticed.
  const [seriesLoading, setSeriesLoading] = useState(!!event?.series_id)
  useEffect(() => {
    if (!event?.series_id) { setSeriesLoading(false); return }
    let cancelled = false
    setSeriesLoading(true)
    // BUG FIX (2026-09-16): event_series is deliberately service-role-only
    // RLS (migration 055) -- a direct client-side `supabase.from(...)`
    // select here was silently blocked (no error, just an empty result),
    // so this never actually populated with the real saved pattern; the
    // form always showed its hardcoded fallback (weekly, no weekday)
    // instead. Fixed by reading through the new authorized GET on
    // /api/series, which applies the same admin/owner/coordinator check
    // every other series action already uses.
    authedFetch(`/api/series?series_id=${event.series_id}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.series) return
        const data = d.series
        setSeriesRow(data)
        setRecur({ enabled: true, rule_type: data.rule_type, rule_config: data.rule_config || {},
          month_end_policy: data.month_end_policy || "clamp", horizon_months: data.horizon_months || 6 })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSeriesLoading(false) })
    return () => { cancelled = true }
  }, [event?.series_id])
  const recurChanged = () => seriesRow && (
    recur.rule_type !== seriesRow.rule_type ||
    JSON.stringify(recur.rule_config || {}) !== JSON.stringify(seriesRow.rule_config || {}) ||
    (recur.month_end_policy || "clamp") !== (seriesRow.month_end_policy || "clamp") ||
    (recur.horizon_months || 6) !== (seriesRow.horizon_months || 6))

  // Book return date defaulting to the NEXT event (2026-09-15, Iain, item
  // #6): "Return Date option would be fixed to the date of the next event
  // by default. Therefor the option should just be Set Book Return date to
  // next event Y/N. If N then manually enter a return date."
  //
  // "Next event" means different things depending on where this form is:
  //  - Editing an occurrence that's already part of a real series
  //    (event.series_id) -- look up the actual next persisted occurrence,
  //    since that reflects any one-off edits/exceptions, not just the raw
  //    rule.
  //  - Creating a brand-new event with a recurrence enabled (recurMode ===
  //    "series") -- nothing exists yet to look up, so compute it with the
  //    same nextOccurrence() engine that will generate the real series on
  //    Save, seeded from the day after this occurrence's own date.
  //  - A one-off event with no recurrence at all -- there IS no next
  //    event, so the Y/N toggle doesn't apply; the date field just stays a
  //    plain manual input, unchanged from before this feature.
  const [nextSeriesEventDate, setNextSeriesEventDate] = useState(null)
  useEffect(() => {
    if (!event?.series_id) { setNextSeriesEventDate(null); return }
    let cancelled = false
    supabase.from("events").select("event_date")
      .eq("series_id", event.series_id).eq("archived", false)
      .gt("event_date", event.event_date).order("event_date", { ascending: true }).limit(1)
      .then(({ data }) => { if (!cancelled) setNextSeriesEventDate(data?.[0]?.event_date || null) })
    return () => { cancelled = true }
  }, [event?.series_id, event?.event_date])
  const computedNextReturnDate = event?.series_id
    ? nextSeriesEventDate
    : (!event && recurMode === "series" && recur.enabled && form.event_date)
      ? nextOccurrence({ ...recur, start_date: form.event_date }, dateStrPlusDays(form.event_date, 1))
      : null
  const [bookReturnMode, setBookReturnMode] = useState(computedNextReturnDate ? "next" : "manual")
  const bookReturnModeTouched = useRef(false)
  // Re-defaults to "next" the moment a next-event date first becomes
  // computable (e.g. the admin only just switched Repeats on) -- but never
  // overrides an explicit Y/N choice the admin has already made.
  useEffect(() => {
    if (bookReturnModeTouched.current) return
    setBookReturnMode(computedNextReturnDate ? "next" : "manual")
  }, [computedNextReturnDate])
  useEffect(() => {
    if (bookReturnMode === "next" && computedNextReturnDate) set("book_return_date", computedNextReturnDate)
  }, [bookReturnMode, computedNextReturnDate])
  // Default changed 2026-09-16 (Iain): "This and future dates" is the
  // default selection when editing a recurring occurrence, not "This date
  // only" -- most edits to a recurring event are meant to apply going
  // forward, and the old "this"-only default combined with the recurrence
  // editor being gated behind "future" meant the real saved pattern was
  // never even visible unless the admin thought to click the other button.
  const [seriesScope, setSeriesScope] = useState("future")   // 'this' | 'future' (scope §6)
  const [occBusy, setOccBusy] = useState(false)
  const { ask: askSameDate, Modal: SameDateModal } = useSameDateWarning()
  const { ask: askRequestOnly, Modal: RequestOnlyModal } = useRequestOnlyAcknowledge()
  useEffect(() => {
    if (recurMode !== "pattern" || !recur.enabled || !recur.rule_type) return
    const d = nextOccurrence({ rule_type: recur.rule_type, rule_config: recur.rule_config, start_date: todayStr, month_end_policy: recur.month_end_policy }, todayStr)
    if (d) setForm(f => ({ ...f, event_date: d }))
  }, [recurMode, recur.enabled, recur.rule_type, JSON.stringify(recur.rule_config), recur.month_end_policy])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  const [busDriver, setBusDriver] = useState(event?.bus_driver_id || null)

  const [saveError, setSaveError] = useState(null)
  // Mandatory-field tracking (Iain, 2026-08-04) -- this form's Save button
  // used to just go quietly disabled with no explanation at all when Date or
  // Book was missing (the silent-failure pattern this app keeps tripping
  // over -- see Silent Failure Bugs in project memory), and Location/
  // Coordinators were never enforced at all despite Coordinators being
  // labelled mandatory. Live -- computed fresh every render from current
  // form state, not gated behind a Save click, so a field lights up (or
  // clears) the instant its value changes. FIELD_ORDER matches this form's
  // actual screen order (title -> date -> location -> end time -> book ->
  // coordinators), not the order these checks happen to run in below.
  const fieldRefs = useRef({})
  // Order matches the form's actual screen order after the 2026-08-07
  // regrouping (bring now renders before book, not after).
  // Iain, 2026-08-22: Start Time had NO mandatory check at all here --
  // no asterisk, no red border, not in FIELD_ORDER/computeInvalidFields --
  // while End Time got the full treatment, so a resident could Save with
  // no start time and no warning. Social's own event_time field hit this
  // exact bug once already (2026-08-04, see that file's own FIELD_ORDER
  // comment) and was fixed there; Clubs never got the equivalent fix.
  // Mirrored here to match Social exactly, not invented fresh.
  const FIELD_ORDER = ["title", "event_date", "event_time", "location", "event_end_time", "bring", "book", "coordinators"]
  function computeInvalidFields() {
    const invalid = []
    if (!caps.hasBooks && !form.title.trim()) invalid.push("title")
    if (!form.event_date) invalid.push("event_date")
    if (!form.event_time) invalid.push("event_time")
    const venueMissing = form.location_type === "onsite" ? !form.location_id : !form.location.trim()
    if (venueMissing) invalid.push("location")
    if (needsSpaceValidation({ location_type: form.location_type, bookable: selectedLocation?.bookable }) && !form.event_end_time) invalid.push("event_end_time")
    // Book is no longer mandatory (2026-09-15, Iain, item #4): "need to be
    // able to create events without knowing the book" -- BookPicker now
    // offers an explicit "Not selected yet" choice for exactly this case,
    // and leaving it unset entirely is equally valid (same as picking that
    // option). The book can be set later by editing this occurrence once
    // it's decided.
    // Bring Something: Required only makes sense once at least one category is
    // chosen -- Iain, 2026-08-07, after catching the form letting Required
    // stay ON with zero categories selected (stale state left over from
    // picking a category, turning Required on, then deselecting it again).
    if (form.booking_required && caps.bringEnabled && form.bring_required && (form.bring_category_ids || []).length === 0) invalid.push("bring")
    if (!form.coordinator_ids.length) invalid.push("coordinators")
    return invalid
  }
  const invalidFields = computeInvalidFields()
  const FIELD_MESSAGES = {
    title: "Please give the event a name.",
    event_date: "Date is required.",
    event_time: "Start time is required.",
    location: "Please choose a venue.",
    event_end_time: "An end time is required for events in a common space.",
    book: "Please choose a book.",
    bring: "Bringing something is set to Required -- choose at least one category, or switch it to Optional.",
    coordinators: "At least one coordinator is required.",
  }

  async function save() {
    if (invalidFields.length) {
      setSaveError(FIELD_MESSAGES[invalidFields[0]])
      scrollToFirstInvalid(fieldRefs, FIELD_ORDER, invalidFields)
      return
    }
    setSaving(true)
    setSaveError(null)

    // Recurring SERIES create (schedule-defined clubs only, new events only).
    // The API generates the occurrences + fires one notification (scope §3/§9).
    if (!event && recurMode === "series" && recur.enabled && recur.rule_type) {
      try {
        const res = await authedFetch("/api/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            club_id: club.id, mode: "series",
            rule_type: recur.rule_type, rule_config: recur.rule_config,
            month_end_policy: recur.month_end_policy, horizon_months: recur.horizon_months,
            start_date: form.event_date, event_time: form.event_time || "00:00",
            title: form.title.trim() || club?.name || "Group/Club Event",
            description: form.description, welcome_message: form.welcome_message,
            location_type: form.location_type || "onsite", location: form.location || null, location_id: form.location_id || null,
            // event_end_time was never sent here at all (2026-09-15, migration
            // 107) -- location_id made it across but had nowhere to land
            // server-side; end time didn't even get that far. See
            // lib/generateSeriesEvents.js's occurrencePayload() for the full
            // root-cause note.
            event_end_time: form.event_end_time || null,
            max_seats: Number(form.max_seats) || 20,
            max_seats_per_booking: Number(form.max_seats_per_booking) || 1,
            booking_required: !!form.booking_required,
            allow_nonresident_guests: Number(form.max_seats_per_booking) > 1 ? !!form.allow_nonresident_guests : false,
            require_attendee_names: Number(form.max_seats_per_booking) > 1 ? !!form.require_attendee_names : false,
            payment_required: !!form.payment_required,
            cost: form.payment_required ? (Number(form.cost) || 0) : 0,
            bring_category_ids: caps.bringEnabled ? (form.bring_category_ids || []) : [],
            bring_required: caps.bringEnabled ? !!form.bring_required : false,
            theme_name: caps.hasTheme ? (form.theme_name.trim() || null) : null,
            is_public: form.is_public !== false, show_attendee_names: form.show_attendee_names !== false,
            coordinator_ids: form.coordinator_ids || [],
          }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveError(d.error || "Could not create the recurring event."); setSaving(false); return }
      } catch (e) { setSaveError("Could not create the recurring event."); setSaving(false); return }
      setSaving(false)
      onSave()
      return
    }

    // Upsert book record — only for clubs that actually have a books
    // catalogue. Previously this dereferenced selectedBook unconditionally,
    // which threw (and silently killed the save) for any club without a book.
    let bookId = null
    if (caps.hasBooks && selectedBook) {
    bookId = selectedBook.id || null
    if (!bookId && selectedBook.google_books_id) {
      // we_own=false: Book Club and the Book Library are distinct systems
      // that happen to share the same Google Books API and the same
      // `books` table (Iain, 2026-09-15) -- this dedupe lookup must never
      // match a we_own=true Library row just because it happens to share a
      // google_books_id with a newly-searched suggestion. Without this
      // scope, picking a book here that a Library title also happens to be
      // sourced from would silently link the event to the LIBRARY's row
      // (bookId = existing.id below) instead of creating/using a genuine
      // Suggestions row -- the two systems bleeding into each other via a
      // shared external id, same root cause class as the missing we_own
      // filter just fixed on this picker's own read query above. Mirrors
      // BookCatalogue.js's own identical dedupe check, which already scopes
      // this correctly.
      const { data: existing } = await supabase
        .from("books")
        .select("id")
        .eq("we_own", false)
        .eq("google_books_id", selectedBook.google_books_id)
        .maybeSingle()

      if (existing) {
        bookId = existing.id
      } else {
        const { data: newBook, error: bookErr } = await supabase
          .from("books")
          .insert({
            title:          selectedBook.title,
            author:         selectedBook.author,
            cover_url:      selectedBook.cover_url,
            summary:        selectedBook.summary,
            rating:         selectedBook.rating,
            rating_link:    selectedBook.rating_link,
            google_books_id: selectedBook.google_books_id,
            genres:         selectedBook.genres,
            published_year: selectedBook.published_year || null,
          })
          .select("id")
          .single()
        if (bookErr) { setSaveError("Could not save book: " + bookErr.message); setSaving(false); return }
        bookId = newBook?.id
      }
    }

    }

    const payload = {
      club_id:         club.id,
      event_date:      form.event_date,
      event_time:      form.event_time || "00:00",
      event_end_time:  form.event_end_time || null,
      title:           form.title.trim() || selectedBook?.title || club?.name || "Group/Club Event",
      is_public:       form.is_public !== false,
      show_attendee_names: form.show_attendee_names !== false,
      description:     form.description,
      welcome_message: form.welcome_message,
      book_id:         caps.hasBooks ? bookId : null,
      kit_return_date: caps.hasKitReturn  ? (form.kit_return_date  || null) : null,
      book_return_date: caps.hasBookReturn ? (form.book_return_date || null) : null,
      reservation_cutoff: cutoffFromDateValue(form.reservation_cutoff),
      max_seats:       Number(form.max_seats) || 20,
      location_type:   form.location_type || "onsite",
      location:        form.location || null,
      location_id:     form.location_id || null,
      has_bus:         form.location_type === "offsite" ? !!form.has_bus : false,
      bus_driver_id:   form.location_type === "offsite" && form.has_bus ? (busDriver || null) : null,
      bus_max_seats:   form.location_type === "offsite" && form.has_bus && form.bus_max_seats !== "" ? Number(form.bus_max_seats) : null,
      allow_personal_vehicles: form.location_type === "offsite" ? !!form.allow_personal_vehicles : false,
      max_seats_per_booking: Number(form.max_seats_per_booking) || 1,
      booking_required: !!form.booking_required,
      allow_nonresident_guests: Number(form.max_seats_per_booking) > 1 ? !!form.allow_nonresident_guests : false,
      require_attendee_names: Number(form.max_seats_per_booking) > 1 ? !!form.require_attendee_names : false,
      payment_required: !!form.payment_required,
      cost:            form.payment_required ? (Number(form.cost) || 0) : 0,
      payment_due_by:  form.payment_required ? (form.payment_due_by || null) : null,
      bring_category_ids: caps.bringEnabled ? (form.bring_category_ids || []) : [],
      bring_required:  caps.bringEnabled ? !!form.bring_required : false,
      theme_name:      caps.hasTheme ? (form.theme_name.trim() || null) : null,
      book_snapshot:   selectedBook ? {
        title:     selectedBook.title,
        author:    selectedBook.author,
        cover_url: selectedBook.cover_url,
      } : null,
      coordinator_ids: form.coordinator_ids || [],
    }

    if (needsSpaceValidation({ location_type: payload.location_type, bookable: selectedLocation?.bookable }) && !payload.event_end_time) {
      setSaveError("An end time is required for events in a common space."); setSaving(false); return
    }

    // Space hard block (B) is checked FIRST -- if the space is unavailable
    // that's the only message, never a soft warning the user clicks through
    // just to get rejected anyway on save (Iain, 2026-07-23). Same-date soft
    // warning (A) only shows when there's no hard conflict.
    try {
      const pre = await authedFetch("/api/events/precheck", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: payload.event_date, event_time: payload.event_time, event_end_time: payload.event_end_time,
          location_type: payload.location_type, location_id: payload.location_id, exclude_event_id: event?.id || null,
        }),
      }).then(r => r.json()).catch(() => ({}))
      if (pre.spaceConflict) {
        setSaveError(pre.spaceConflict.message); setSaving(false)
        scrollToFirstInvalid(fieldRefs, FIELD_ORDER, ["location"])
        return
      }
      if (pre.sameDateEvents?.length) {
        if (!(await askSameDate(pre.sameDateEvents))) { setSaving(false); return }
      }
    } catch {}

    // Event create/edit now goes through a service-role route (2026-07-23) so
    // the space-clash check is authoritative -- see app/api/clubs/events. Book
    // upsert above stays client-side; only the events row + coordinators +
    // notifications + series-scope propagation move server-side.
    let eventId = event?.id
    if (eventId) {
      const res = await authedFetch("/api/clubs/events", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId, series_scope: seriesScope,
          recur_changed: !!event?.series_id && recurChanged(),
          recur: (event?.series_id && recurChanged()) ? {
            rule_type: recur.rule_type, rule_config: recur.rule_config,
            month_end_policy: recur.month_end_policy, horizon_months: recur.horizon_months,
          } : null,
          ...payload,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(d.error || "Could not update event."); setSaving(false); return }
    } else {
      const res = await authedFetch("/api/clubs/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(d.error || "Could not create event."); setSaving(false); return }
      eventId = d.id
    }

    // Persist the meeting pattern for content-defined clubs so it pre-fills next
    // time (Book Club, §7a). Fire-and-forget; the single event is already saved.
    if (!event && recurMode === "pattern" && recur.enabled && recur.rule_type) {
      try {
        authedFetch("/api/series", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ club_id: club.id, mode: "pattern", rule_type: recur.rule_type, rule_config: recur.rule_config,
            month_end_policy: recur.month_end_policy, horizon_months: recur.horizon_months, start_date: form.event_date, event_time: form.event_time || "00:00" }) }).catch(() => {})
      } catch {}
    }
    // Every error branch above returns early, so reaching here always means
    // success -- checking the `saveError` STATE variable instead of a local
    // flag was the bug (Iain, 2026-07-23): setSaveError(null) at the top of
    // this function schedules a re-render but doesn't update THIS closure's
    // `saveError` synchronously, so a stale error from an earlier failed
    // attempt in the same form session (e.g. the hard-block message) could
    // still be truthy here and silently skip onSave() -- the event saved
    // fine, the form just never closed / never returned to the club page.
    setSaving(false)
    onSave()
    // "Request Only" (Iain, 2026-08-04): a toast auto-dismissed and was
    // still too easy to miss -- forces an explicit OK click instead, on
    // top of the bell notification.
    if (selectedLocation?.request_only) {
      await askRequestOnly(selectedLocation.name)
    }
  }

  async function removeOccurrence() {
    if (!event?.id) return
    if (!confirm("Remove just this date? Anyone booked on it will be notified.")) return
    setOccBusy(true)
    try {
      const res = await authedFetch("/api/series", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_occurrence", event_id: event.id }) })
      if (res.ok) { onSave() } else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || "Could not remove this date.")
      }
    } catch (e) { setSaveError("Could not remove this date -- check your connection and try again.") }
    setOccBusy(false)
  }
  async function endSeries() {
    if (!event?.series_id) return
    if (!confirm("End this recurring series? Future dates that no one has booked will be removed; booked dates are kept.")) return
    setOccBusy(true)
    try {
      const res = await authedFetch("/api/series", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", series_id: event.series_id }) })
      if (res.ok) { onSave() } else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || "Could not end the series.")
      }
    } catch (e) { setSaveError("Could not end the series -- check your connection and try again.") }
    setOccBusy(false)
  }
  // Cancel a standalone event -- a solo one-off, or a mode:'pattern' event (Book
  // Club), neither of which carries a series_id so isSeriesOccurrence is false.
  // Same endpoint/action as removeOccurrence (it archives any event by id and
  // notifies its bookers) -- this just surfaces it outside the series UI too.
  async function cancelSoloEvent() {
    if (!event?.id) return
    if (!confirm("Cancel this event? Anyone booked will be notified. This can't be undone.")) return
    setOccBusy(true)
    try {
      const res = await authedFetch("/api/series", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_occurrence", event_id: event.id }) })
      if (res.ok) { onSave() } else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || "Could not cancel this event.")
      }
    } catch (e) { setSaveError("Could not cancel this event -- check your connection and try again.") }
    setOccBusy(false)
  }

  const labelStyle = { fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }

  return (
    <>
    {SameDateModal}
    {RequestOnlyModal}
    <div style={{ background: "var(--surface)", borderRadius: 16, border: `2px solid ${colour}`,
      padding: "1.25rem", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: "1rem", color: clubInk(colour), marginBottom: 16 }}>
        {event ? `Edit ${club?.name || "Club"} Event` : `Add ${club?.name || "Club"} Event`}
      </div>

      <div ref={el => (fieldRefs.current.title = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Name{!caps.hasBooks && <span style={{ color: "var(--danger)" }}> *</span>}
          {invalidFields.includes("title") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <input value={form.title} onChange={e => set("title", e.target.value)}
          placeholder={caps.hasBooks ? "Leave blank to use the book title" : "e.g. Italian Night"}
          style={{ ...inputStyle, ...(invalidFields.includes("title") ? INVALID_FIELD_STYLE : {}) }} />
      </div>

      <div ref={el => (fieldRefs.current.event_date = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Date <span style={{ color: "var(--danger)" }}>*</span>
          {invalidFields.includes("event_date") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <input type="date" autoFocus value={form.event_date} onChange={e => set("event_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
          style={{ ...inputStyle, ...(invalidFields.includes("event_date") ? INVALID_FIELD_STYLE : { border: "1.5px solid var(--green)" }) }} />
      </div>

      <div ref={el => (fieldRefs.current.event_time = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Start Time <span style={{ color: "var(--danger)" }}>*</span>
          {invalidFields.includes("event_time") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <TimeField value={form.event_time} onChange={v => set("event_time", v)} colour={form.event_time ? "var(--green)" : "var(--danger)"} invalid={invalidFields.includes("event_time")} />
      </div>

      {!event && (
        <div style={{ marginBottom: 12 }}>
          <RecurrencePicker value={recur} onChange={setRecur} startDate={form.event_date} colour={colour} mode={recurMode} />
        </div>
      )}

      <div ref={el => (fieldRefs.current.location = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Location <span style={{ color: "var(--danger)" }}>*</span>
          {invalidFields.includes("location") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["onsite", "offsite"].map(t => (
            <button key={t} type="button" onClick={() => { set("location_type", t); set("location", ""); set("location_id", null) }}
              style={{ flex: 1, padding: "0.55rem", borderRadius: 10, fontFamily: "inherit", fontSize: "0.88rem",
                fontWeight: 700, cursor: "pointer", border: "2px solid",
                borderColor: form.location_type === t ? colour : "var(--border)",
                background: form.location_type === t ? colour + "18" : "var(--surface)",
                color: form.location_type === t ? colour : "var(--text-dim)" }}>
              {t === "onsite" ? "On-site" : "Off-site"}
            </button>
          ))}
        </div>
        {form.location_type === "onsite" ? (
          // Bound to the location ID, not its name. An id with no matching row
          // (venue archived or deleted) is called out rather than silently
          // re-saved, which is how a renamed room used to wipe location_id.
          // TODO(follow-up, flagged not fixed 2026-08-04): this is a native
          // <select>, which app/globals.css's standing standard bans
          // app-wide -- pre-existing, left alone here to keep this diff
          // focused on mandatory-field enforcement.
          <select value={form.location_id || ""} onChange={e => set("location_id", e.target.value || null)}
            style={{ ...inputStyle, cursor: "pointer", ...(invalidFields.includes("location") ? INVALID_FIELD_STYLE : {}) }}>
            <option value="">Select venue…</option>
            {form.location_id && !onsiteLocations.some(l => l.id === form.location_id) && (
              <option value={form.location_id}>Venue no longer available — choose again</option>
            )}
            {onsiteLocations.map(l => <option key={l.id} value={l.id}>{l.name}{l.request_only ? " (Request Only)" : ""}</option>)}
          </select>
        ) : (
          <textarea value={form.location} onChange={e => set("location", e.target.value)} rows={3}
            placeholder="Enter venue name and address…"
            style={{ ...inputStyle, resize: "vertical", ...(invalidFields.includes("location") ? INVALID_FIELD_STYLE : {}) }} />
        )}
      </div>

      {/* Bus — only relevant for offsite events (mirrors Social's toggle, Iain 2026-08-19) */}
      {form.location_type === "offsite" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Toggle value={form.has_bus} colour={colour}
              onChange={v => { set("has_bus", v); if (!v) setBusDriver(null) }}
              label="Community bus" />
          </div>
          {form.has_bus && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Bus Driver (optional)</label>
              <CoordPicker members={members} value={busDriver} onChange={setBusDriver} valid colour={colour}
                placeholder="Search for bus driver…" />
            </div>
          )}
          {form.has_bus && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Bus max seats <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional — blank = uncapped)</span></label>
              <input type="number" min="0" value={form.bus_max_seats}
                onChange={e => set("bus_max_seats", e.target.value)} style={inputStyle} placeholder="Uncapped" />
            </div>
          )}
          {/* Personal vehicles (migration 109, Iain 2026-09-17) — a second,
              independent transport option alongside Bus. Plain on/off, no
              admin fields: the driver's own seats-offered number and
              passenger picks are all set by residents in the booking flow. */}
          <div style={{ marginBottom: 12 }}>
            <Toggle value={form.allow_personal_vehicles} colour={colour}
              onChange={v => set("allow_personal_vehicles", v)}
              label="Personal vehicles" />
          </div>
        </>
      )}

      {needsSpaceValidation({ location_type: form.location_type, bookable: selectedLocation?.bookable }) && (
        <div ref={el => (fieldRefs.current.event_end_time = el)} style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Ends <span style={{ color: "var(--danger)" }}>*</span>
            {invalidFields.includes("event_end_time") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
          </label>
          <TimeField value={form.event_end_time} onChange={v => set("event_end_time", v)} colour={form.event_end_time ? "var(--green)" : "var(--danger)"} invalid={invalidFields.includes("event_end_time")} minHour={form.event_time ? Number(form.event_time.split(":")[0]) : null} />
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>Lets the app stop this space being double-booked by another event.</div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Details</label>
        <RichEditor
          initialValue={form.description}
          hubColour={colour}
          bg="card"
          onChange={html => set("description", html)}
          placeholder="Any extra details about this meeting…"
        />
      </div>

      {/* Booking -- "open, all welcome" events skip capacity/payment/attendee
          policy entirely (Iain, 2026-09-11 -- Groups & Clubs dry run). Sits
          ahead of Attendees since it decides whether that whole section, plus
          Payment, is even relevant. */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Booking</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ v: true, t: "Requires booking" }, { v: false, t: "Open — All Welcome" }].map(opt => (
            <button key={String(opt.v)} type="button" onClick={() => set("booking_required", opt.v)}
              style={{ flex: 1, padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.88rem", fontFamily: "inherit", cursor: "pointer",
                border: `1.5px solid ${!!form.booking_required === opt.v ? colour : "var(--border)"}`,
                background: !!form.booking_required === opt.v ? colour : "var(--surface)",
                color: !!form.booking_required === opt.v ? "#fff" : "var(--text)",
                fontWeight: !!form.booking_required === opt.v ? 700 : 500 }}>{opt.t}</button>
          ))}
        </div>
        {!form.booking_required && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 6 }}>
            Anyone can attend — no seat count, payment, or sign-up required.
          </div>
        )}
      </div>

      {form.booking_required && (
        <>
      {/* Attendees -- who's coming and what we need from them: capacity,
          per-booking cap, guest/naming policy, and (if the club has it)
          bring-a-dish. Grouped together per Iain, 2026-08-07 -- these were
          previously split across "Capacity & Cost" and "Extras", which is
          why Bring Something read as randomly placed. */}
      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Total Seats</label>
          <input type="number" min={1} max={500} value={form.max_seats}
            onChange={e => set("max_seats", e.target.value)} onWheel={e => e.currentTarget.blur()}
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Max per Booking</label>
          <input type="number" min={1} max={10} value={form.max_seats_per_booking}
            onChange={e => set("max_seats_per_booking", e.target.value)} onWheel={e => e.currentTarget.blur()}
            style={inputStyle} />
        </div>
      </div>

      {Number(form.max_seats_per_booking) > 1 && (
        <AttendeeNamingPicker
          allowGuests={form.allow_nonresident_guests}
          onAllowGuestsChange={v => set("allow_nonresident_guests", v)}
          required={form.require_attendee_names}
          onRequiredChange={v => set("require_attendee_names", v)}
          colour={colour}
        />
      )}

      {caps.bringEnabled && (
      <div ref={el => (fieldRefs.current.bring = el)} style={{ marginBottom: 12, marginTop: 12 }}>
        <label style={labelStyle}>Attendees bring something
          {invalidFields.includes("bring") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Select a category or turn off Required</span>}
        </label>
        <BringCategoryPicker clubId={club?.id} colour={colour}
          value={form.bring_category_ids} onChange={v => set("bring_category_ids", v)} />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Is bringing something required to book?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: false, t: "Optional" }, { v: true, t: "Required" }].map(opt => (
              <button key={String(opt.v)} type="button" onClick={() => set("bring_required", opt.v)}
                style={{ flex: 1, padding: "0.5rem", borderRadius: 10, fontSize: "0.82rem", fontFamily: "inherit", cursor: "pointer",
                  border: `1.5px solid ${invalidFields.includes("bring") && opt.v ? "#dc2626" : !!form.bring_required === opt.v ? colour : "var(--border)"}`,
                  background: !!form.bring_required === opt.v ? colour : "var(--surface)",
                  color: !!form.bring_required === opt.v ? "#fff" : "var(--text)",
                  fontWeight: !!form.bring_required === opt.v ? 700 : 500 }}>{opt.t}</button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Payment -- a different kind of decision (money, not who's coming),
          kept out of Attendees on purpose. Always available to the event
          creator/editor, same as Social Hive and Special Events -- no
          club-level admin setup step required (Iain, 2026-09-08: "the
          event creator/editor should be able to turn this on"). */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Paid event</label>
        <div style={{ display: "flex", gap: 8, marginBottom: form.payment_required ? 10 : 0 }}>
          {[{ v: false, t: "Free" }, { v: true, t: "Paid" }].map(opt => (
            <button key={String(opt.v)} type="button" onClick={() => set("payment_required", opt.v)}
              style={{ flex: 1, padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.88rem", fontFamily: "inherit", cursor: "pointer",
                border: `1.5px solid ${form.payment_required === opt.v ? colour : "var(--border)"}`,
                background: form.payment_required === opt.v ? colour : "var(--surface)",
                color: form.payment_required === opt.v ? "#fff" : "var(--text)",
                fontWeight: form.payment_required === opt.v ? 700 : 500 }}>{opt.t}</button>
          ))}
        </div>
        {form.payment_required && (
          <>
            <label style={labelStyle}>Cost per person ($)</label>
            <input type="number" min={0} step={1} value={form.cost} onChange={e => set("cost", e.target.value)}
              onWheel={e => e.currentTarget.blur()} placeholder="e.g. 25" style={{ ...inputStyle, marginBottom: 10 }} />
            <label style={labelStyle}>Payment due by (optional)</label>
            <input type="date" value={form.payment_due_by} onChange={e => set("payment_due_by", e.target.value)}
              onClick={e => e.currentTarget.showPicker?.()} style={inputStyle} />
          </>
        )}
      </div>
        </>
      )}

      {/* Lending -- what's being lent out for this event and when it's due
          back, grouped with the Book picker rather than left near Capacity
          (Iain, 2026-08-07). Book Club-style clubs only. */}
      {caps.hasBooks && (
      <div ref={el => (fieldRefs.current.book = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Book <span style={{ color: "var(--danger)" }}>*</span>
          {invalidFields.includes("book") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <BookPicker onSelect={setSelectedBook} initialBook={event?.books || null} colour={colour} invalid={invalidFields.includes("book")} />
      </div>
      )}

      {caps.hasKitReturn && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Kit Return Date</label>
        <input type="date" value={form.kit_return_date} onChange={e => set("kit_return_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
          style={inputStyle} />
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>When the whole kit goes back to the library.</div>
      </div>
      )}

      {caps.hasBookReturn && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Book Return Date</label>
        {computedNextReturnDate && (
          <div style={{ marginBottom: 8 }}>
            <Toggle value={bookReturnMode === "next"} onChange={v => { bookReturnModeTouched.current = true; setBookReturnMode(v ? "next" : "manual") }}
              label="Set to next event's date" colour={colour} />
          </div>
        )}
        {bookReturnMode === "next" && computedNextReturnDate ? (
          <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "var(--text-dim)" }}>
            {new Date(computedNextReturnDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        ) : (
          <input type="date" value={form.book_return_date} onChange={e => set("book_return_date", e.target.value)} onClick={e => e.currentTarget.showPicker?.()}
            style={inputStyle} />
        )}
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>When attendees must return their copy to you — allow time before the kit return date.</div>
      </div>
      )}

      <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { k: "is_public",           label: "Public calendar" },
          { k: "show_attendee_names", label: "Show attendees" },
        ].map(({ k, label }) => (
          <button key={k} type="button" onClick={() => set(k, !form[k])}
            style={{ padding: "0.6rem 0.5rem", borderRadius: 10, fontSize: "0.85rem", fontFamily: "inherit",
              cursor: "pointer", fontWeight: form[k] ? 700 : 500,
              border: `1.5px solid ${form[k] ? colour : "var(--border)"}`,
              background: form[k] ? colour + "18" : "var(--surface)",
              color: form[k] ? colour : "var(--text-dim)" }}>
            {form[k] ? "✓ " : ""}{label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Bookings Close (optional)</label>
        <input type="date" value={form.reservation_cutoff} onChange={e => set("reservation_cutoff", e.target.value)}
          onClick={e => e.currentTarget.showPicker?.()} style={inputStyle} />
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>Bookings stay open for all of this day, then residents see &ldquo;Bookings Closed&rdquo;. Leave blank to keep them open until the event.</div>
      </div>

      {event?.id && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Image</label>
        <EventImagePicker
          eventId={event.id}
          imageUrl={event?.image_url}
          focalX={event?.image_focal_x}
          focalY={event?.image_focal_y}
          colour={colour}
          getToken={getToken}
        />
      </div>
      )}
      {!event?.id && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Image</label>
        <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontStyle: "italic" }}>Create the event first, then reopen it to add a photo.</div>
      </div>
      )}

      {caps.hasTheme && (
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Theme</label>
        <input value={form.theme_name} onChange={e => set("theme_name", e.target.value)}
          placeholder="e.g. Italian Night" style={inputStyle} />
      </div>
      )}

      <div ref={el => (fieldRefs.current.coordinators = el)} style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Event Coordinator{form.coordinator_ids.length !== 1 ? "s" : ""} <span style={{ color: "var(--danger)" }}>*</span> 
          {invalidFields.includes("coordinators") && <span style={{ color: "#dc2626", fontWeight: 800, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>⚠ Required</span>}
        </label>
        <CoordMultiPicker
          members={members}
          value={form.coordinator_ids}
          onChange={ids => set("coordinator_ids", ids)}
          colour={colour}
          invalid={invalidFields.includes("coordinators")}
        />
      </div>


      {saveError && (
        <div style={{ marginBottom: 10, padding: "0.6rem 0.9rem", background: "rgba(220,50,50,0.1)",
          color: "var(--danger)", borderRadius: 10, fontSize: "0.82rem", fontWeight: 600 }}>
          {saveError}
        </div>
      )}
      {isSeriesOccurrence && (
        <div style={{ marginBottom: 12, padding: "0.75rem", border: `1px solid ${colour}`, borderRadius: 12, background: colour + "10" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 6 }}>📅 Part of a recurring series — apply changes to:</div>
          {/* Loading guard (2026-09-16): don't show the scope toggle, the
              repeat-pattern editor, or the Remove/End actions until the
              real saved series row has actually loaded -- rendering these
              off the hardcoded `recur` fallback was indistinguishable on
              screen from a genuinely-loaded "no repeat set" series, which
              is exactly how the RLS-blocked read above went unnoticed. */}
          {seriesLoading ? (
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0.4rem 0" }}>Loading recurring series details…</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["this", "This date only"], ["future", "This and future dates"]].map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setSeriesScope(v)}
                    style={{ flex: 1, padding: "0.5rem", borderRadius: 8, fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
                      border: seriesScope === v ? `1px solid ${colour}` : "1px solid var(--border)",
                      background: seriesScope === v ? colour : "var(--surface)", color: seriesScope === v ? clubTextOn(colour) : "var(--text)" }}>{lbl}</button>
                ))}
              </div>
              {seriesScope === "future" && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 4 }}>Repeat pattern (applies to future dates):</div>
                  <RecurrencePicker value={recur} onChange={setRecur} startDate={form.event_date} colour={colour} mode="series" />
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={removeOccurrence} disabled={occBusy}
                  style={{ flex: 1, padding: "0.5rem", borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.78rem", cursor: occBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Remove this date</button>
                <button type="button" onClick={endSeries} disabled={occBusy}
                  style={{ flex: 1, padding: "0.5rem", borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.78rem", cursor: occBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>End series</button>
              </div>
            </>
          )}
        </div>
      )}
      {event && !isSeriesOccurrence && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={cancelSoloEvent} disabled={occBusy}
            style={{ width: "100%", padding: "0.6rem", borderRadius: 8, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: "0.8rem", cursor: occBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel this event</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: "0.75rem", background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", color: "var(--text)", fontFamily: "inherit" }}>
          Cancel
        </button>
        {/* Was previously disabled outright (with no explanation at all) when
            Date or Book was missing -- the exact "silent failure" pattern
            flagged repeatedly elsewhere in this app. Now always clickable
            (bar the in-flight save) so pressing it always tells you what's
            missing and jumps to it, same as every other event form.
            Loading guard (2026-09-16): also disabled while the real saved
            series row is still loading -- Save must not be clickable until
            the actual saved recurrence pattern has arrived, otherwise a
            save fired against the hardcoded fallback state could silently
            overwrite the real recurrence with defaults. */}
        <button onClick={save} disabled={saving || (isSeriesOccurrence && seriesLoading)}
          style={{ flex: 2, padding: "0.75rem", background: colour, border: "none",
            borderRadius: 12, fontWeight: 700, fontSize: "0.9rem", color: clubTextOn(colour),
            cursor: (saving || (isSeriesOccurrence && seriesLoading)) ? "not-allowed" : "pointer",
            opacity: (saving || (isSeriesOccurrence && seriesLoading)) ? 0.6 : 1, fontFamily: "inherit" }}>
          {saving ? "Saving…" : (isSeriesOccurrence && seriesLoading) ? "Loading…" : event ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// ── Join/leave + club notices (Phase 2c) ─────────────────────────────────────
// Joining is notices-only — never a gate on booking. Only joined members get
// notified when a notice is posted; anyone can read them here.
function ClubSocial({ club, colour, isAdmin }) {
  const { member } = useUser()
  const [joined, setJoined]     = useState(null)   // null = loading
  const [busy, setBusy]         = useState(false)
  const [notices, setNotices]   = useState([])
  const [composing, setComposing] = useState(false)
  const [draft, setDraft]       = useState("")
  const [posting, setPosting]   = useState(false)
  const [toast, setToast]       = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState("")
  const [saving, setSaving]       = useState(false)
  // Owner eligibility for posting notices -- same space_owners rows that
  // make someone eligible to answer questions asked on this club's page.
  const { owners } = useOwners("club", club.id)
  const isOwner = !!member?.id && owners.some(o => o.id === member.id)

  const loadNotices = () => {
    supabase.from("club_notices").select("id, content, created_at")
      .eq("club_id", club.id).eq("archived", false).order("created_at", { ascending: false })
      .then(({ data }) => setNotices(data || []))
  }
  useEffect(() => {
    loadNotices()
    if (!member?.id) { setJoined(false); return }
    supabase.from("club_members").select("member_id").eq("club_id", club.id).eq("member_id", member.id).maybeSingle()
      .then(({ data }) => setJoined(!!data))
  }, [club.id, member?.id])

  async function toggleJoin() {
    if (!member?.id || busy) return
    setBusy(true)
    if (joined) {
      await supabase.from("club_members").delete().eq("club_id", club.id).eq("member_id", member.id)
      setJoined(false)
    } else {
      await supabase.from("club_members").insert({ club_id: club.id, member_id: member.id })
      setJoined(true)
    }
    setBusy(false)
  }

  async function postNotice() {
    if (!draft.trim() || posting) return
    setPosting(true)
    const res = await authedFetch("/api/clubs/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: club.id, content: draft }),
    })
    const data = await res.json()
    setPosting(false)
    if (!res.ok) { setToast(data.error || "Could not post"); setTimeout(() => setToast(null), 3000); return }
    setDraft(""); setComposing(false); loadNotices()
    setToast(data.notified ? `Posted — ${data.notified} member${data.notified !== 1 ? "s" : ""} notified` : "Posted")
    setTimeout(() => setToast(null), 3000)
  }

  // Edit a notice in place (Iain, 2026-09-24) -- same as hub notices
  // (components/HubNotices.js). Saves quietly, members are not re-notified.
  async function saveEdit() {
    if (!editDraft.trim() || saving) return
    setSaving(true)
    try {
      const res = await authedFetch("/api/clubs/notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, content: editDraft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setToast(d.error || "Could not save changes"); setTimeout(() => setToast(null), 3000); return }
      setEditingId(null); setEditDraft(""); loadNotices()
      setToast("Notice updated"); setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  // Inline confirm (was a native browser confirm() -- brought in line with
  // hub notices and the no-native-controls UI standard, 2026-09-24).
  async function removeNotice(id) {
    setConfirmId(null)
    const res = await authedFetch("/api/clubs/notices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setToast?.(d.error || "Could not remove notice")
      setTimeout(() => setToast?.(null), 3000)
    }
    loadNotices()
  }

  const fmt = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" })

  return (
    <div style={{ marginBottom: 16 }}>
      {toast && <div style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "var(--text)", color: "var(--bg)", padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>{toast}</div>}

      {/* Join + Post notice — compact pills on one line, outside any event */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {member?.id && joined !== null && (
          <button onClick={toggleJoin} disabled={busy} title={joined ? "Tap to leave — you'll stop getting this group/club's notices" : "Join to get this group/club's notices"}
            style={{ padding: "0.4rem 0.9rem", borderRadius: 20, fontFamily: "inherit", fontWeight: 700,
              fontSize: "0.82rem", cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap",
              border: `1.5px solid ${colour}`,
              background: joined ? "var(--surface)" : colour,
              color: joined ? colour : "#fff" }}>
            {joined ? "✓ Joined" : "Join"}
          </button>
        )}
        {/* Member count + expandable name list, Owner/admin only (Iain,
            2026-08-31) — same admin-or-owner gate as Post notice below. */}
        <MembersToggle table="club_members" column="club_id" value={club.id}
          colour={clubInk(colour)} visible={isAdmin || isOwner} />
        {(isAdmin || isOwner) && !composing && (
          <button onClick={() => setComposing(true)}
            style={{ padding: "0.4rem 0.9rem", borderRadius: 20, border: `1px dashed ${colour}`,
              background: "transparent", color: clubInk(colour), fontWeight: 700, fontFamily: "inherit",
              fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}>
            📣 Post notice
          </button>
        )}
      </div>

      {/* Admin/Owner composer */}
      {(isAdmin || isOwner) && composing && (
        (() => (
          <div style={{ marginBottom: 12, border: `1px solid ${colour}`, borderRadius: 12, padding: "0.75rem" }}>
            <RichEditor key="club-notice" initialValue="" hubColour={colour.startsWith("var(") ? undefined : colour}
              bg="card" onChange={setDraft} placeholder="Write a notice for this group/club's members…" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { setComposing(false); setDraft("") }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
              <button onClick={postNotice} disabled={posting || !draft.trim()} style={{ flex: 2, padding: "0.6rem", borderRadius: 10, border: "none", background: colour, color: clubTextOn(colour), fontWeight: 700, fontFamily: "inherit", cursor: (posting || !draft.trim()) ? "not-allowed" : "pointer", opacity: (posting || !draft.trim()) ? 0.6 : 1 }}>{posting ? "Posting…" : "Post notice"}</button>
            </div>
          </div>
        ))()
      )}

      {/* Notices */}
      {notices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notices.map(n => (
            <div key={n.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${colour}`, borderRadius: 10, padding: "0.75rem 0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: clubInk(colour), textTransform: "uppercase", letterSpacing: "0.04em" }}>📣 Notice</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{fmt(n.created_at)}</span>
              </div>
              {editingId === n.id ? (
                <div style={{ marginTop: 6 }}>
                  <RichEditor key={`club-notice-edit-${n.id}`} initialValue={n.content} hubColour={colour.startsWith("var(") ? undefined : colour}
                    bg="card" onChange={setEditDraft} placeholder="Notice text…" />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setEditingId(null); setEditDraft("") }} style={{ flex: 1, padding: "0.6rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving || !editDraft.trim()} style={{ flex: 2, padding: "0.6rem", borderRadius: 10, border: "none", background: colour, color: clubTextOn(colour), fontWeight: 700, fontFamily: "inherit", cursor: (saving || !editDraft.trim()) ? "not-allowed" : "pointer", opacity: (saving || !editDraft.trim()) ? 0.6 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5, marginTop: 4 }}>
                  {isHtmlContent(n.content)
                    ? <span dangerouslySetInnerHTML={{ __html: n.content }} />
                    : n.content}
                </div>
              )}
              {(isAdmin || isOwner) && editingId !== n.id && (confirmId === n.id ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Remove this notice?</span>
                  <button onClick={() => removeNotice(n.id)} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Yes, remove</button>
                  <button onClick={() => setConfirmId(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Keep</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <button onClick={() => { setEditingId(n.id); setEditDraft(n.content); setConfirmId(null) }} style={{ background: "none", border: "none", color: clubInk(colour), fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Edit</button>
                  <button onClick={() => setConfirmId(n.id)} style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Remove</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClubHome({ club }) {
  const { member, isAdmin } = useUser()
  // Club Owner gets the same create/edit/manage-events options an admin has,
  // scoped to this club only (Iain, 2026-08-10) — the space_owners primitive
  // already existed for Questions routing; this is the first place it's used
  // to gate an actual permission rather than just display/routing.
  const { owners: clubOwners } = useOwners("club", club?.id)
  const isOwner   = !!member?.id && clubOwners.some(o => o.id === member.id)
  const canManage = isAdmin || isOwner
  // Everything below is driven by the club's CONFIG, never by a hub name —
  // that's what lets Book Club and Dinner Club share this one page.
  const caps   = clubCaps(club)
  const welcomeText = club?.welcome_text || ""

  const colour = club?.colour || "var(--purple)"
  const [events,      setEvents]      = useState([])  // all non-archived BC events ordered by date asc
  const [myBookings,  setMyBookings]  = useState({})  // eventId → booking
  const [myWaitlists, setMyWaitlists] = useState({})  // eventId → my waitlist row (split bookings)
  const [loadCount,   setLoadCount]   = useState(0)
  // Waitlist position + real waitlist seat totals, server-side (BUG-067) --
  // the browser can't see other residents' waitlist rows (bookings RLS), so
  // seatCounts' waitlist figure below is only correct for admins.
  const waitlistInfo = useWaitlistInfo(events.map(e => e.id), loadCount)
  const [seatCounts,  setSeatCounts]  = useState({})  // eventId → {confirmed, waitlist} seats
  const [busSeatCounts, setBusSeatCounts] = useState({})  // eventId → confirmed bus seats used (all members, incl. me)
  const [myBookedIds, setMyBookedIds] = useState(new Set())  // past event ids user participated in
  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null) // { msg, type } | null
  const [showForm,    setShowForm]    = useState(false)
  const [clubPattern, setClubPattern] = useState(null)  // content-defined clubs (§7a)
  const [editEvent,   setEditEvent]   = useState(null)
  const [slideOutEvent, setSlideOutEvent] = useState(null)
  const [outstandingBook, setOutstandingBook] = useState(null) // { book_id, title } — member's most recent unreturned book, if any

  function showToast(msg, type = "success") { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  function toSlideOutShape(ev, myBooking) {
    // Block joining a different book while a previously-issued kit copy hasn't
    // been returned yet (has_book=true, cleared manually by EC/admin). Same
    // book (a repeat cycle) is always allowed through.
    const bookConflictTitle = (outstandingBook && ev.book_id && outstandingBook.book_id !== ev.book_id)
      ? outstandingBook.title
      : null
    return {
      ...ev,
      hub_type: "club",
      club_id: club.id,
      club,
      max_seats: ev.max_seats ?? 0,
      bookings_count: (seatCounts[ev.id]?.confirmed) || 0,
      waitlist_count: waitlistInfo[ev.id]?.waitlist_seats ?? ((seatCounts[ev.id]?.waitlist) || 0),
      bus_seats_used: busSeatCounts[ev.id] || 0,
      my_bookings: [
        ...((myBooking && myBooking.status !== "cancelled")
          ? [{ status: myBooking.status, seats: myBooking.seats || 1, payment_status: myBooking.payment_status ?? null, has_book: !!myBooking.has_book }]
          : []),
        // Split booking: the waitlist half too, so the pop-up shows both
        // parts like every other hub (BUG-067).
        ...((myBooking?.status === "confirmed" && myWaitlists[ev.id])
          ? [{ status: "waitlist", seats: myWaitlists[ev.id].seats || 1, payment_status: null, has_book: false }]
          : []),
      ],
      book: ev.books || null,
      book_conflict_title: bookConflictTitle,
      payment_required: !!ev.payment_required,
    }
  }

  function openSlideOut(ev) {
    setSlideOutEvent(toSlideOutShape(ev, myBookings[ev.id]))
  }

  // For PastEventsAccordion's onOpenEvent: unlike openSlideOut above, the
  // accordion only hands back an id (its past-events API returns a light
  // {id, title, event_date, ...} row, not the full event) -- and a past
  // event isn't guaranteed to already be in local `events` state (that's
  // scoped to non-archived events). Fetches fresh, same select shape as the
  // main load() query, so the Coordinator can reach "Write a recap" inside
  // CoordinatorPanel even for a meeting they never personally booked.
  async function openEventById(id) {
    const { data } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, event_end_time, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names, cost, payment_due_by, payment_required, location_type, location, location_id, has_bus, bus_max_seats, bus_driver_id, allow_personal_vehicles, bus_driver:members!bus_driver_id(name, username), image_url, image_focal_x, image_focal_y, theme_name, bring_category_ids, bring_required, description, welcome_message, book_id, kit_return_date, book_return_date, reservation_cutoff, book_snapshot, series_id, is_series_exception, books(id, title, author, cover_url, rating, rating_link, summary, published_year), event_coordinators(id, member_id, replaced_at, members!event_coordinators_member_id_fkey(name, username))")
      .eq("id", id).single()
    if (!data) return
    setSlideOutEvent(toSlideOutShape(data, myBookings[id]))
  }

  async function handleSlideOutRefresh() {
    if (!slideOutEvent) return
    const currentId = slideOutEvent.id
    // Refresh booking state in-place so user sees confirmation without slideout closing
    const { data: bkRows } = await supabase
      .from("bookings")
      .select("id, status, seats, payment_status, has_book")
      .eq("event_id", currentId)
      .eq("member_id", member?.id)
      .neq("status", "cancelled")
    // A split booking legitimately returns two rows (confirmed + waitlist), so
    // this can't use maybeSingle(). Carry the real seats/payment_status through
    // rather than assuming one unpaid seat.
    // Both halves of a split booking (confirmed + waitlist), confirmed first.
    const bks = [...(bkRows || [])].sort((a, b) => (a.status === "confirmed" ? 0 : 1) - (b.status === "confirmed" ? 0 : 1))
    setSlideOutEvent(prev => prev ? {
      ...prev,
      my_bookings: bks.map(bk => ({ status: bk.status, seats: bk.seats || 1, payment_status: bk.payment_status ?? null, has_book: !!bk.has_book })),
    } : null)
    load()
  }

  // BUG FIX (2026-09-16, BUG-055 sweep): this used to read event_series
  // directly via the anon-key client, exactly like the recurring-series edit
  // bug fixed in AdminEventForm above -- event_series is deliberately
  // service-role-only RLS (migration 055), so this was silently blocked
  // every time and clubPattern was always null in production. That meant
  // creating a NEW event for a content-defined club (Book Club, Gym
  // Happenings) never pre-filled the club's own established recurrence
  // pattern, the same silent-failure class as the edit-form bug. Fixed by
  // reading through the new club_id+mode=pattern lookup on GET /api/series
  // (admin/owner/coordinator gated, same as every other series action) --
  // and skipped entirely for a viewer who can't manage the club, since only
  // canManage can ever open the form that uses this.
  async function loadClubPattern() {
    if (!canManage) { setClubPattern(null); return }
    if (!(clubCaps(club).hasBooks || clubCaps(club).oneEventAtATime)) return
    try {
      const res = await authedFetch(`/api/series?club_id=${club.id}&mode=pattern`)
      const d = await res.json().catch(() => ({}))
      setClubPattern(d?.series || null)
    } catch { setClubPattern(null) }
  }
  async function load() {
    setLoading(true)
    // Loading guard (2026-09-16, standing principle -- see CLAUDE.md's Coding
    // Standards): awaited, not fire-and-forget, so the page's existing
    // `if (loading) return <skeleton>` gate above also covers this fetch --
    // "+ Add Event" can't be clicked, and AdminEventForm can't mount with a
    // new event's initial recur state, before the real club pattern (if any)
    // has actually arrived.
    await loadClubPattern()
    const today = sydneyTodayStr()

    // All non-archived BC events
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, event_date, event_time, event_end_time, max_seats, max_seats_per_booking, allow_nonresident_guests, require_attendee_names, cost, payment_due_by, payment_required, location_type, location, location_id, has_bus, bus_max_seats, bus_driver_id, allow_personal_vehicles, bus_driver:members!bus_driver_id(name, username), image_url, image_focal_x, image_focal_y, theme_name, bring_category_ids, bring_required, description, welcome_message, book_id, kit_return_date, book_return_date, reservation_cutoff, book_snapshot, series_id, is_series_exception, books(id, title, author, cover_url, rating, rating_link, summary, published_year), event_coordinators(id, member_id, replaced_at, members!event_coordinators_member_id_fkey(name, username))")
      .eq("club_id", club.id)
      .eq("archived", false)
      .order("event_date", { ascending: true })

    // Attach community vote scores to event.books
    const bookIds = (evs || []).map(e => e.books?.id).filter(Boolean)
    let enrichedEvs = evs || []
    if (bookIds.length) {
      const { data: bvotes } = await supabase.from("book_votes").select("book_id, score").in("book_id", bookIds)
      const scoreSums = {}, scoreCounts = {}
      for (const v of bvotes || []) {
        scoreSums[v.book_id]   = (scoreSums[v.book_id]   || 0) + v.score
        scoreCounts[v.book_id] = (scoreCounts[v.book_id] || 0) + 1
      }
      enrichedEvs = enrichedEvs.map(e => !e.books ? e : {
        ...e,
        books: {
          ...e.books,
          avg_score:  scoreCounts[e.books.id] ? (scoreSums[e.books.id] / scoreCounts[e.books.id]).toFixed(1) : null,
          vote_count: scoreCounts[e.books.id] || 0,
        }
      })
    }
    setEvents(enrichedEvs)

    // Seat counts for every event, so the booking modal shows real capacity
    // (this used to be hardcoded to 0, which made every club event look fully
    // booked and forced people onto the waitlist — Iain 2026-07-18).
    if (evs?.length) {
      const allIds = evs.map(e => e.id)
      const { data: allBk } = await supabase
        .from("bookings").select("event_id, status, seats, bus_passenger")
        .in("event_id", allIds).neq("status", "cancelled")
      const counts = {}
      for (const b of allBk || []) {
        const c = counts[b.event_id] || (counts[b.event_id] = { confirmed: 0, waitlist: 0 })
        if (b.status === "confirmed") c.confirmed += (b.seats || 1)
        else if (b.status === "waitlist") c.waitlist += (b.seats || 1)
      }
      setSeatCounts(counts)

      // Bus seats used per event — pre-aggregated here since ClubHome (unlike
      // Social) never builds full bookings/booking_attendees arrays per event
      // (Iain, 2026-08-19). Confirmed owner bus seats + confirmed attendees'
      // bus seats. EventSlideOut's BookingSection falls back to this number
      // (event.bus_seats_used) when event.bookings/booking_attendees aren't
      // arrays, then subtracts the current member's own snapshot usage from it.
      const busCounts = {}
      for (const b of allBk || []) {
        if (b.status === "confirmed" && b.bus_passenger) busCounts[b.event_id] = (busCounts[b.event_id] || 0) + 1
      }
      const busEventIds = (evs || []).filter(e => e.has_bus).map(e => e.id)
      if (busEventIds.length) {
        // booking_attendees is keyed by (event_id, owner_id), not a specific
        // bookings row (a member's booking can split/promote between confirmed
        // and waitlist) -- so "is this party confirmed" has to be resolved by
        // cross-referencing against confirmed bookings.member_id, same as
        // lib/busSeats.js's callers are expected to do.
        const { data: confBk } = await supabase
          .from("bookings").select("event_id, member_id")
          .in("event_id", busEventIds).eq("status", "confirmed")
        const confirmedOwners = new Set((confBk || []).map(b => `${b.event_id}:${b.member_id}`))
        const { data: allAtt } = await supabase
          .from("booking_attendees")
          .select("event_id, owner_id, is_bus_passenger")
          .in("event_id", busEventIds)
        for (const a of allAtt || []) {
          if (a.is_bus_passenger && confirmedOwners.has(`${a.event_id}:${a.owner_id}`)) {
            busCounts[a.event_id] = (busCounts[a.event_id] || 0) + 1
          }
        }
      }
      setBusSeatCounts(busCounts)
    }

    // My bookings for all BC events
    if (member?.id && evs?.length) {
      const ids = evs.map(e => e.id)
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, event_id, status, seats, payment_status, has_book, book_given_at")
        .eq("member_id", member.id)
        .in("event_id", ids)
        .neq("status", "cancelled")

      // A member can have more than one row per event (a confirmed booking
      // plus a waitlist row, or history from a cancel-and-rebook). Blindly
      // taking the last row meant a CANCELLED booking could overwrite the
      // confirmed one, so the card showed "Tap to sign up" while the server
      // correctly refused with "Already booked" (Iain 2026-07-18). Cancelled
      // rows are now excluded and confirmed always wins.
      const byEvent = {}
      for (const b of bks || []) {
        const existing = byEvent[b.event_id]
        if (!existing || (existing.status !== "confirmed" && b.status === "confirmed")) {
          byEvent[b.event_id] = b
        }
      }
      setMyBookings(byEvent)
      const waitByEvent = {}
      for (const b of bks || []) if (b.status === "waitlist") waitByEvent[b.event_id] = b
      setMyWaitlists(waitByEvent)
      setLoadCount(c => c + 1)

      // Past participated events
      const past = (evs || []).filter(e => e.event_date < today)
      const participated = new Set(past.filter(e => byEvent[e.id]?.status === "confirmed").map(e => e.id))
      setMyBookedIds(participated)
    }

    // Outstanding book check — this member's most recent unreturned kit copy, if
    // any (has_book=true is never auto-cleared, including on cancellation — see
    // Book Club scope). Used to block joining a different book until it's back.
    if (member?.id) {
      const { data: outRows } = await supabase
        .from("bookings")
        .select("id, has_book, book_given_at, events(id, book_id, title, books(title))")
        .eq("member_id", member.id)
        .eq("has_book", true)
        .order("book_given_at", { ascending: false })
        .limit(1)
      const row = outRows?.[0]
      setOutstandingBook(row?.events?.book_id
        ? { book_id: row.events.book_id, title: row.events.books?.title || row.events.title }
        : null)
    } else {
      setOutstandingBook(null)
    }

    // Members for EC picker (admin or this club's Owner)
    if (canManage) {
      const { data: mems } = await supabase.from("members").select("id, name, display_name, username").eq("is_test", false).order("name")
      setMembers(mems || [])
    }

    setLoading(false)
  }

  useEffect(() => { if (member?.id !== undefined) load() }, [member?.id, canManage])

  // Event Deep Linking (?event=<id>) -- Event_Deep_Linking_and_Calendar_Scope_v2,
  // build sequence step 1. Club events are only ever opened from the already-
  // loaded `events` list (no per-id fetch exists here), so this waits for
  // that load and matches against it; a dead/expired link surfaces a toast
  // rather than doing nothing. Ref guards against re-running (and re-
  // toasting) on every subsequent load() call.
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (loading || deepLinkHandled.current) return
    const params = new URLSearchParams(window.location.search)
    const evId = params.get("event")
    if (!evId) return
    deepLinkHandled.current = true
    const match = events.find(ev => String(ev.id) === evId)
    if (match) openSlideOut(match)
    else showToast("This event isn't available anymore", "error")
  }, [loading, events])

  async function signUp(event) {
    const res = await authedFetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, seats: 1 }),
    })
    const d = await res.json()
    if (!res.ok) { showToast("Could not sign up: " + (d.error || "error")); return }
    showToast("You're signed up!")
    await load()
  }

  async function leave(event) {
    const res = await authedFetch("/api/bookings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      showToast("Could not leave event: " + (d.error || "unknown error"))
      return
    }
    showToast("Booking cancelled")
    await load()
  }

  // A club/group is a list of ACTIVITIES (Iain, 2026-07-21). Each activity is a
  // single event or a recurring series; recurring ones show ONE parent card (the
  // next occurrence) with their future dates nested beneath. Group upcoming events
  // by series; standalone events each stand alone.
  const today = sydneyTodayStr()
  const upcoming = events.filter(e => e.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || "").localeCompare(b.event_time || ""))

  const activities = (() => {
    const bySeries = {}
    const solo = []
    for (const e of upcoming) {
      if (e.series_id) (bySeries[e.series_id] = bySeries[e.series_id] || []).push(e)
      else solo.push(e)
    }
    const list = []
    for (const sid of Object.keys(bySeries)) {
      const occ = bySeries[sid]   // already sorted (upcoming is sorted)
      list.push({ key: "s" + sid, parent: occ[0], children: occ.slice(1), isSeries: true })
    }
    for (const e of solo) list.push({ key: "e" + e.id, parent: e, children: [], isSeries: false })
    list.sort((a, b) => a.parent.event_date.localeCompare(b.parent.event_date) || (a.parent.event_time || "").localeCompare(b.parent.event_time || ""))
    return list
  })()

  // Closed = PAST events only.
  const closedEvents = events.filter(e => e.event_date < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))

  // One-at-a-time clubs (Book Club) block a second overlapping activity; groups
  // schedule as many activities as they like.
  const canAdd = canManage && (!caps.oneEventAtATime || upcoming.length === 0)

  // Delete a single future occurrence (EC-only): archives it + notifies its bookers.
  async function handleDeleteOccurrence(ev) {
    if (!confirm("Remove this date? Anyone booked on it will be notified. This can't be undone.")) return
    try {
      const res = await authedFetch("/api/series", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_occurrence", event_id: ev.id }) })
      if (res.ok) { load() } else {
        const d = await res.json().catch(() => ({}))
        showToast?.(d.error || "Could not remove this date")
      }
    } catch (e) { showToast?.("Could not remove this date -- check your connection and try again.") }
  }

  if (loading) return (
    <div style={{ padding: "1.25rem 1rem 6rem" }}>
      {[180, 60, 60].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 14, background: "var(--surface2)", marginBottom: 12 }} />
      ))}
    </div>
  )

  return (
    <div style={{ padding: "1.25rem 1rem 6rem", position: "relative", zIndex: 1 }}>
      <Toast msg={toast?.msg} type={toast?.type} />

      <ClubSocial club={club} colour={colour} isAdmin={isAdmin} />

      {/* Welcome tile */}
      {welcomeText && (
        <div style={{ background: colour, borderRadius: 14,
          padding: "1rem", marginBottom: 16, fontSize: "0.9rem", color: clubTextOn(colour), lineHeight: 1.6 }}>
          {isHtmlContent(welcomeText)
            ? <span dangerouslySetInnerHTML={{ __html: welcomeText }} />
            : welcomeText}
        </div>
      )}

      <ContactBar contextType="club" contextKey={club?.id} contextLabel={club?.name} colour={colour} style={{ marginTop: -4, marginBottom: 16 }} />

      {/* Owner self-service (Owner_SelfService_and_Library_Hub_Scope_v1, Part A.3):
          an admin or this club's Owner can reach the standalone "Manage this club"
          screen from here — not via Admin, which has no per-area scoping. */}
      {canManage && (
        <Link href={`/clubs/${club?.slug}/manage`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.4rem 0.9rem",
            borderRadius: 20, border: `1px dashed ${colour}`, background: "transparent",
            color: clubInk(colour), fontWeight: 700, fontFamily: "inherit", fontSize: "0.82rem",
            textDecoration: "none", marginBottom: 16 }}>
          ⚙ Manage {club?.name || "Club"}
        </Link>
      )}

      {/* Admin/Owner: add a new activity (single event or recurring series) */}
      {canManage && !showForm && canAdd && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => { setEditEvent(null); setShowForm(true) }}
            style={{ background: colour, color: clubTextOn(colour), border: "none", borderRadius: 20,
              padding: "8px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
            + Add Event
          </button>
        </div>
      )}

      {/* Admin event form */}
      {showForm && (
        <AdminEventForm
          club={club}
          colour={colour}
          event={editEvent}
          clubPattern={clubPattern}
          members={members}
          onSave={() => { setShowForm(false); setEditEvent(null); load() }}
          onClose={() => { setShowForm(false); setEditEvent(null) }}
        />
      )}

      {/* Activities — one parent card per activity; recurring ones nest their
          future dates beneath (Iain, 2026-07-21) */}
      {activities.length ? activities.map(act => (
        <div key={act.key}>
          <EventCard
            event={act.parent}
            label={act.isSeries ? "Next date" : "Event"}
            booking={myBookings[act.parent.id]}
            myWaitlist={myBookings[act.parent.id]?.status === "confirmed" ? myWaitlists[act.parent.id] : null}
            waitlistInfo={waitlistInfo[act.parent.id]}
            onOpen={() => openSlideOut(act.parent)}
            onEdit={!showForm ? () => { setEditEvent(act.parent); setShowForm(true) } : null}
            colour={colour}
            club={club}
            showToast={showToast}
          />
          <UpcomingDatesAccordion events={act.children} myBookings={myBookings} waitlistInfo={waitlistInfo}
            onOpen={openSlideOut} onEdit={!showForm ? (ev) => { setEditEvent(ev); setShowForm(true) } : null} colour={colour} club={club} />
        </div>
      )) : (
        <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)",
          padding: "1.5rem", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>📚</div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>No meetings scheduled yet</div>
        </div>
      )}

      {/* Closed events (past only) -- book-catalogue return/participation
          history. Gated to hasBooks (Iain, 2026-09-22): this accordion was
          never actually restricted to book-enabled clubs despite being
          built purely for Book Club's return tracking (cover art, "✓
          Participated" badge) -- confirmed by reading its render, which
          falls back to a generic 📖 emoji and shows for every club with any
          past event. That made it a near-duplicate of the Happenings News
          Past Events accordion right below for every non-book club (e.g.
          Gym Happenings), showing the same events twice for no reason. */}
      {caps.hasBooks && (
        <ClosedEventsAccordion events={closedEvents} myBookedIds={myBookedIds} colour={colour} />
      )}

      {/* Happenings News recap of this club's own past events -- separate
          from ClosedEventsAccordion above (that one's about the club's
          book-catalogue "closed meeting" history; this one's every past
          event, with a link through to its news post if one exists). */}
      <PastEventsAccordion clubId={club.id} colour={colour} onOpenEvent={openEventById} />

      {/* Unified booking slide-over */}
      <EventSlideOut
        event={slideOutEvent}
        onClose={() => setSlideOutEvent(null)}
        onRefresh={handleSlideOutRefresh}
      />
    </div>
  )
}
