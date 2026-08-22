"use client"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import TimeField from "@/components/TimeField"
import { authedFetch } from "@/lib/getAuthToken"
import { BOOKING_REASON_MAX, INGENIA_CONFIRMED_BY_MAX } from "@/lib/spaceBookings"
import { sydneyTodayStr, isoToSydneyHHMM } from "@/lib/date"
import { toInstant, sydneyOffsetMinutes } from "@/lib/spaces"

// Venue hours (Iain, 2026-08-17): every space is only bookable 8am-10pm,
// full stop -- applied here so it covers both entry points (Book by Date
// and the Book by Location hand-off), rather than only the new flow, since
// this reads as a venue-wide policy and the two flows share this one form.
const SPACE_HOUR_FLOOR = 8
const SPACE_HOUR_CEIL = 22
const DAY_CLOSE_MIN = SPACE_HOUR_CEIL * 60

function toMinutes(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number)
  return h * 60 + m
}

// Busy [start,end) intervals (in minutes-since-midnight) for ONE location on
// ONE date, from the same {bookings, events} shape /api/spaces?calendar_from=
// &calendar_to=&location_id= already returns (used by LocationScheduleView).
//
// Iain, 2026-08-19 (live-fire find): a legacy club event with a location but
// no event_end_time -- predates the space-clash feature (2026-07-23), which
// by locked decision (lib/eventClash.js, "no retroactive backfill") leaves
// these permanently unchecked by the real hard-block too, not just this UI --
// was silently vanishing from the busy picture entirely (an interval needs
// BOTH ends to compute) instead of showing as booked. Treated the same way
// the real clash-check philosophy would want if it could see it: grey
// conservatively from its start through the venue's closing hour, rather
// than showing that time as free when it might not be.
function computeBusyIntervals(bookings, events, dateStr) {
  const intervals = []
  for (const b of (bookings || [])) {
    const s = toMinutes(isoToSydneyHHMM(b.starts_at))
    if (s == null) continue
    const e = toMinutes(isoToSydneyHHMM(b.ends_at)) ?? DAY_CLOSE_MIN
    if (e > s) intervals.push([s, e])
  }
  for (const e of (events || [])) {
    if (e.event_date !== dateStr) continue
    const s = toMinutes(e.event_time)
    if (s == null) continue
    const en = toMinutes(e.event_end_time) ?? DAY_CLOSE_MIN
    if (en > s) intervals.push([s, en])
  }
  return intervals
}

function slotsFromIntervals(intervals) {
  const slots = new Set()
  for (let m = 0; m < 24 * 60; m += 30) {
    const slotEnd = m + 30
    if (intervals.some(([s, en]) => s < slotEnd && en > m)) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0")
      const mm = m % 60 === 0 ? "00" : "30"
      slots.add(`${hh}:${mm}`)
    }
  }
  return slots
}

// Once a Start is chosen, the booking window runs continuously from it to
// whatever End is picked -- it can't "skip over" an occupied stretch. So the
// End field's disabled set isn't just each busy slot's own half-hour match;
// every slot from the first busy interval starting AT OR AFTER Start, through
// the rest of the day, is unreachable too (Iain, 2026-08-19: "the end start
// AND End hours should be unavailable for selection (Logically)" -- ending
// inside, or having to run through, an occupied stretch is never valid).
function endDisabledSlotsFor(startTime, busySlots, busyIntervals) {
  if (!startTime) return busySlots
  const startMin = toMinutes(startTime)
  if (startMin == null) return busySlots
  const boundary = busyIntervals
    .filter(([s]) => s >= startMin)
    .reduce((min, [s]) => (min == null || s < min ? s : min), null)
  if (boundary == null) return busySlots
  const extended = new Set(busySlots)
  for (let m = boundary; m < 24 * 60; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0")
    const mm = m % 60 === 0 ? "00" : "30"
    extended.add(`${hh}:${mm}`)
  }
  return extended
}

// Book a Space — Personal Space Booking. Scope:
// Social_Hive_Personal_Space_Booking_Scope.md (decisions locked 2026-08-01).
//
// Deliberate flow order, per Iain 2026-08-01: "enforce a user date and time
// from/to decision, before then enabling location, as this would filter the
// available locations based on the date and time nominated." Date/time first,
// THEN the location list — never the other way round. This is also how the
// visibility question got answered: a resident sees what's genuinely free
// for their chosen window by construction, rather than a separate browsable
// list of every booking's private reason.
//
// Any resident can book any bookable space for their own use, independent of
// every hub/club — this form is deliberately NOT scoped to one.

// Same hub-label convention Admin's room-usage view uses (EVENT_HUB_META in
// app/(app)/admin/page.js) — kept as its own small copy here rather than a
// shared import, since this file only needs the label text, not the icon.
const HUB_LABEL = { movie: "Show Time", social: "Social", bookclub: "Book Club", club: "Groups & Clubs" }

// Turns the precheck response's two independent lists (events, personal
// bookings) into one flat list of same-day clashes for display — each item
// carries what the space-booking clash requirement (Iain, 2026-08-04) asks
// for: the space booked, a description, and who's responsible. Events show
// their real hub/club name (already public).
//
// REVISED (Iain, 2026-08-17, Social_Hive_Location_First_Booking_Scope_v2.md
// item 5): personal bookings used to be anonymised to "A resident" here.
// That's superseded -- the API now returns booked_by_name already resolved
// through the exact same Attendees-list rule (resolveMemberName), so this
// just displays it, same as an event's hub name.
function buildClashItems(sameDateEvents, sameDatePersonalBookings) {
  const fromEvents = (sameDateEvents || []).map(e => ({
    key: `event:${e.id}`,
    space: e.locations?.name || null,
    description: e.title || "An event",
    responsible: HUB_LABEL[e.hub_type] || e.hub_type,
  }))
  const fromPersonal = (sameDatePersonalBookings || []).map((b, i) => ({
    key: `personal:${i}`,
    space: b.location_name,
    description: b.title || "A personal booking",
    responsible: b.is_own ? "You" : (b.booked_by_name || "A resident"),
  }))
  return [...fromEvents, ...fromPersonal]
}

function ClashList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(it => (
        <div key={it.key}>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)" }}>{it.description}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
            {[it.space, it.responsible].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
    </div>
  )
}

// A dedicated pre-submit warning for this form, deliberately NOT
// SameDateWarning.js's shared useSameDateWarning() hook — that hook's Modal
// only renders a titles-joined-by-commas sentence, which can't show the
// richer per-item space/description/responsible-party breakdown this
// requirement (Iain, 2026-08-04) asks for. Screenings/Social/Clubs keep
// using the simple shared version unchanged; this form gets its own so
// fixing its display can't regress theirs. Same ask()/Modal shape as the
// shared hook otherwise, so the call site reads identically.
function useSpaceClashWarning() {
  const [items, setItems] = useState(null)
  const resolveRef = useRef(null)

  const ask = useCallback((clashItems) => new Promise((resolve) => {
    resolveRef.current = resolve
    setItems(clashItems)
  }), [])

  function respond(v) {
    setItems(null)
    resolveRef.current?.(v)
    resolveRef.current = null
  }

  const Modal = !items ? null : (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "1.25rem",
        maxWidth: 380, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 8 }}>Already something on this date</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 14 }}>
          You can still go ahead if that's fine — just check the space you want in the Ingenia app too.
        </div>
        <div style={{ marginBottom: 18 }}>
          <ClashList items={items} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => respond(false)}
            style={{ flex: 1, padding: "0.65rem", borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            Go back
          </button>
          <button type="button" onClick={() => respond(true)}
            style={{ flex: 1, padding: "0.65rem", borderRadius: 10, border: "none",
              background: "var(--danger)", color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )

  return { ask, Modal }
}

function Portal({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

const LABEL = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }
const FIELD = { marginBottom: "1.1rem" }
const INPUT = { width: "100%", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }

function addHour(time) {
  if (!time) return ""
  const [h, m] = time.split(":").map(Number)
  const nh = (h + 1) % 24
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// initialDate/initialStartTime/initialEndTime/initialLocationId: optional
// pre-fill for the hand-off from the Book-by-Location flow (Iain, 2026-08-17,
// Social_Hive_Location_First_Booking_Scope_v2.md) -- a resident picks a free
// slot on a location's schedule first, and this form still does the actual
// booking/validation/Ingenia-confirmation/clash-check, just pre-populated
// rather than starting blank. Location remains changeable after pre-fill --
// this is a convenience default, not a lock.
//
// editBooking (Iain, 2026-08-17: "My Space bookings need to be editable" --
// Cancel was previously the only option): pass the resident's own existing
// booking row -- { id, location_id, starts_at, ends_at, title,
// ingenia_confirmed, ingenia_confirmed_by } -- to reuse this exact same form
// (fields, validation, clash-check, Ingenia confirmation -- request_only is
// re-derived per selected location from the live availability list, same as
// a fresh booking, not read off this object)
// for editing instead of creating. When set, every availability/busy-slot
// check excludes the booking's own id so it never blocks against itself,
// and submit goes to PATCH instead of POST. Takes priority over the
// initial* hand-off props (a resident is never doing both at once).
export default function SpaceBookingForm({
  open, onClose, onBooked, editBooking = null,
  initialDate = "", initialStartTime = "", initialEndTime = "", initialLocationId = "",
}) {
  const isEdit = !!editBooking
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [locations, setLocations] = useState(null) // null = not checked yet
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationId, setLocationId] = useState("")
  const [reason, setReason] = useState("")
  const [ingeniaConfirmed, setIngeniaConfirmed] = useState(false)
  const [ingeniaConfirmedBy, setIngeniaConfirmedBy] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [acknowledgedClash, setAcknowledgedClash] = useState(null) // clash items the resident proceeded past, or null
  // Iain, 2026-08-22: "the first thing you do is choose a space so there
  // should be no reason to have to select a space once in the booking
  // form as you are already booking a selected space" -- when arriving
  // via the Book-by-Location hand-off (or editing an existing booking),
  // the space is already decided; showing the full re-pick list again is
  // redundant friction. false = show a compact "Space: X · Change" line
  // instead of the full list; true = show the full list (the genuine
  // Book-by-Date flow, where no location is known yet, always needs it).
  const [wantChangeSpace, setWantChangeSpace] = useState(false)
  const [busySlots, setBusySlots] = useState(new Set())
  const [busyIntervals, setBusyIntervals] = useState([])
  const fetchTag = useRef(0)
  const { ask: askSameDate, Modal: SameDateModal } = useSpaceClashWarning()

  const today = sydneyTodayStr()
  const windowValid = !!(date && startTime && endTime && endTime > startTime)

  // Already-booked half-hour slots for the CURRENTLY selected location + date
  // (Iain, 2026-08-17) -- only meaningful once a location is already known,
  // which in practice is the Book-by-Location hand-off (locationId is set
  // before a time is picked there). Book by Date never has this: its location
  // list only appears AFTER a time window is chosen, so there's no location
  // yet while these TimeFields are visible -- this effect simply never fires
  // there, which is correct, not a gap.
  useEffect(() => {
    let cancelled = false
    async function loadBusy() {
      if (!open || !locationId || !date) { setBusySlots(new Set()); setBusyIntervals([]); return }
      try {
        const offset = sydneyOffsetMinutes(date)
        const from = toInstant(date, "00:00", offset).toISOString()
        const to = toInstant(date, "23:59", offset).toISOString()
        const res = await authedFetch(`/api/spaces?calendar_from=${encodeURIComponent(from)}&calendar_to=${encodeURIComponent(to)}&location_id=${locationId}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) { setBusySlots(new Set()); setBusyIntervals([]); return }
        // Editing (Iain, 2026-08-17): this window already includes the
        // booking's own current row -- drop it before computing busy
        // intervals so it doesn't greyed-out block its own existing slot.
        const bookings = isEdit ? (data.bookings || []).filter(b => b.id !== editBooking.id) : data.bookings
        const intervals = computeBusyIntervals(bookings, data.events, date)
        setBusyIntervals(intervals)
        setBusySlots(slotsFromIntervals(intervals))
      } catch {
        if (!cancelled) { setBusySlots(new Set()); setBusyIntervals([]) }
      }
    }
    loadBusy()
    return () => { cancelled = true }
  }, [open, locationId, date, isEdit, editBooking?.id])

  // End Time must additionally exclude every slot from the nearest busy
  // interval that starts at-or-after the chosen Start time through the rest
  // of the day (Iain, 2026-08-17) -- an end time can't be selected mid-way
  // through, or past, an occupied stretch. Start keeps the plain busySlots.
  const endDisabledSlots = useMemo(
    () => endDisabledSlotsFor(startTime, busySlots, busyIntervals),
    [startTime, busySlots, busyIntervals]
  )

  // Reset everything when the sheet is closed and reopened, so a stale
  // half-filled booking from last time can't be accidentally submitted.
  // isEdit pre-fills from the existing booking instead of the initial*
  // hand-off props -- starts_at/ends_at are UTC instants, converted back to
  // the Sydney-local date/HH:MM strings this form works in (same conversion
  // LocationScheduleView/MySpaceBookings already use elsewhere).
  useEffect(() => {
    if (open) {
      if (isEdit) {
        pendingInitialLocationRef.current = editBooking.location_id || null
        setDate(sydneyTodayStr(new Date(editBooking.starts_at)))
        setStartTime(isoToSydneyHHMM(editBooking.starts_at))
        setEndTime(isoToSydneyHHMM(editBooking.ends_at))
        setLocations(null); setLocationId(editBooking.location_id); setReason(editBooking.title || "")
        setIngeniaConfirmed(!!editBooking.ingenia_confirmed)
        setIngeniaConfirmedBy(editBooking.ingenia_confirmed_by || "")
      } else {
        pendingInitialLocationRef.current = initialLocationId || null
        setDate(initialDate); setStartTime(initialStartTime); setEndTime(initialEndTime)
        setLocations(null); setLocationId(initialLocationId); setReason("")
        setIngeniaConfirmed(false); setIngeniaConfirmedBy("")
      }
      setError(""); setSuccess(false); setSubmitting(false)
      setAcknowledgedClash(null)
      // A location is already known if editing, or if handed off from
      // Book by Location -- start collapsed to the compact summary in
      // both cases. Book by Date (no initial* props, not editing) still
      // needs the full list since nothing's chosen yet.
      setWantChangeSpace(!isEdit && !initialLocationId)
    }
  }, [open, isEdit, editBooking, initialDate, initialStartTime, initialEndTime, initialLocationId])

  // When start time changes, keep end time sensible (start + 1hr) rather
  // than leaving an invalid or empty end time silently blocking the form.
  // Clamped to the venue-hours ceiling (Iain, 2026-08-17) -- a start of
  // 21:30 auto-advancing to 22:30 would be past the 10pm cutoff and TimeField
  // wouldn't even offer it as an End option.
  function handleStartChange(v) {
    setStartTime(v)
    if (v && (!endTime || endTime <= v)) {
      const auto = addHour(v)
      const ceilStr = `${String(SPACE_HOUR_CEIL).padStart(2, "0")}:00`
      setEndTime(auto > ceilStr ? ceilStr : auto)
    }
  }

  // The pre-filled location (from Book-by-Location's hand-off) survives the
  // first availability load only -- if it's actually free for the window,
  // pre-select it; otherwise leave the picker to the resident, same as a
  // blank-start booking would.
  const pendingInitialLocationRef = useRef(initialLocationId || null)

  const loadLocations = useCallback(async () => {
    if (!windowValid) { setLocations(null); return }
    const tag = ++fetchTag.current
    setLocationsLoading(true)
    const pendingLocationId = pendingInitialLocationRef.current
    pendingInitialLocationRef.current = null
    if (!pendingLocationId) setLocationId("")
    // Don't clear a pending hand-off's Ingenia state -- for editBooking this
    // is the pre-filled confirmation from the original booking, which is
    // still valid for its own unchanged window; a genuine date/time change
    // afterwards clears pendingLocationId and this branch no longer applies,
    // correctly voiding the old confirmation for the new window.
    if (!pendingLocationId) { setIngeniaConfirmed(false); setIngeniaConfirmedBy("") }
    try {
      const excludeParam = isEdit ? `&exclude_booking_id=${editBooking.id}` : ""
      const res = await authedFetch(`/api/spaces?event_date=${date}&event_time=${startTime}&event_end_time=${endTime}${excludeParam}`)
      const data = await res.json()
      if (tag !== fetchTag.current) return
      if (!res.ok) { setError(data.error || "Could not check availability"); setLocations([]); return }
      setError("")
      const list = data.locations || []
      setLocations(list)
      if (pendingLocationId) {
        const match = list.find(l => l.id === pendingLocationId)
        if (match?.available) {
          setLocationId(pendingLocationId)
        } else {
          // The space the resident already committed to isn't free for
          // this window after all (e.g. they changed the date/time) --
          // reveal the full list rather than leaving them stuck on a
          // blank compact summary with no way to pick anything else.
          setLocationId("")
          setWantChangeSpace(true)
        }
      }
    } catch {
      if (tag === fetchTag.current) { setError("Could not check availability — check your connection"); setLocations([]) }
    } finally {
      if (tag === fetchTag.current) setLocationsLoading(false)
    }
  }, [date, startTime, endTime, windowValid, isEdit, editBooking?.id])

  useEffect(() => { loadLocations() }, [loadLocations])

  const reasonTrimmed = reason.trim()
  const selectedLocation = (locations || []).find(l => l.id === locationId) || null
  // "Request Only" (Iain, 2026-08-04): personal use, so EVERY booker must
  // self-declare Ingenia's sign-off before this can submit -- no admin
  // exemption here (that only applies to creating a community EVENT, not
  // booking a space for yourself).
  const needsIngeniaConfirmation = !!selectedLocation?.request_only
  const ingeniaConfirmedByTrimmed = ingeniaConfirmedBy.trim()
  const ingeniaValid = !needsIngeniaConfirmation || (ingeniaConfirmed && ingeniaConfirmedByTrimmed && ingeniaConfirmedByTrimmed.length <= INGENIA_CONFIRMED_BY_MAX)
  const canSubmit = windowValid && locationId && reasonTrimmed && reasonTrimmed.length <= BOOKING_REASON_MAX && ingeniaValid && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true); setError("")

    // Soft same-day warning, in keeping with the event booking modal (Iain,
    // 2026-08-04): another Hive event OR another resident's personal booking
    // that day, in any room, was previously invisible here. Reuses the same
    // precheck endpoint Social/Screenings/Clubs already use, opted in via
    // include_space_bookings so this is the only caller that also learns
    // about other residents' personal space_bookings. Only a soft heads-up
    // -- it never blocks the booking, matching the existing "hard block
    // first, soft warning second, never both" priority.
    let clashItems = null
    try {
      const pre = await authedFetch("/api/events/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: date, event_time: startTime, event_end_time: endTime,
          location_type: "onsite", location_id: locationId,
          include_space_bookings: true,
          exclude_booking_id: isEdit ? editBooking.id : undefined,
        }),
      }).then(r => r.json()).catch(() => ({}))
      const items = buildClashItems(pre.sameDateEvents, pre.sameDatePersonalBookings)
      if (items.length) {
        if (!(await askSameDate(items))) { setSubmitting(false); return }
        clashItems = items
      }
    } catch {
      // Precheck is advisory only -- if it fails, fall through to the real
      // booking attempt rather than blocking on a check that isn't the
      // actual source of truth (the POST below re-validates regardless).
    }

    try {
      const res = await authedFetch("/api/spaces", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: editBooking.id } : {}),
          location_id: locationId, event_date: date, event_time: startTime, event_end_time: endTime, reason: reasonTrimmed,
          ingenia_confirmed: needsIngeniaConfirmation ? ingeniaConfirmed : undefined,
          ingenia_confirmed_by: needsIngeniaConfirmation ? ingeniaConfirmedByTrimmed : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || (isEdit ? "Could not update that booking" : "Could not book that space")); setSubmitting(false); return }
      setAcknowledgedClash(clashItems)
      setSuccess(true)
      // Bug fix (Iain, 2026-08-04 live-fire find): this used to never reset,
      // which permanently disabled handleClose's `if (!submitting)` guard
      // after every successful booking -- the X button (and the backdrop
      // click) silently did nothing, and only "Done" (which calls onClose
      // directly, bypassing the guard) could close the sheet.
      setSubmitting(false)
      onBooked?.(data)
    } catch {
      setError(isEdit ? "Could not update that booking — check your connection" : "Could not book that space — check your connection")
      setSubmitting(false)
    }
  }

  function handleClose() { if (!submitting) onClose?.() }

  return (
    <>
    <Portal>
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 0.25s ease",
      }} />

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 96vw)",
        background: "var(--surface)", zIndex: 301, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        transform: open ? "translateX(0)" : "translateX(100%)", pointerEvents: open ? "auto" : "none",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)", paddingBottom: 32,
      }}>
        <div style={{ height: 6, background: "var(--amber)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
          borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{isEdit ? "Edit Space Booking" : "Book a Space"}</div>
          <button onClick={handleClose} style={{ background: "var(--surface2)", border: "none", borderRadius: "50%",
            width: 36, height: 36, fontSize: 20, cursor: "pointer", color: "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {success ? (
          <div style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.4rem" }}>{isEdit ? "Booking updated" : "Space booked"}</div>
            {acknowledgedClash?.length ? (
              <>
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.85rem" }}>
                  There {acknowledgedClash.length === 1 ? "is" : "are"} also a clash that day:
                </div>
                <div style={{ textAlign: "left", background: "var(--surface2)", borderRadius: 12, padding: "0.9rem 1rem", marginBottom: "1.25rem" }}>
                  <ClashList items={acknowledgedClash} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "1.5rem" }}>
                  Remember to check and book the space in the Ingenia app too.
                </div>
              </>
            ) : (
              <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1.5rem" }}>
                No other Hive event or booking clashes with this. Remember to check and book the space in the Ingenia app too.
              </div>
            )}
            <button onClick={onClose} style={{ background: "var(--teal)", color: "#fff", border: "none", borderRadius: 10,
              padding: "0.8rem 1.5rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", width: "100%" }}>
              Done
            </button>
          </div>
        ) : (
        <div style={{ padding: "1.1rem 1.1rem 0" }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
            {isEdit
              ? "Change the date, time, or space for this booking. It's re-checked for clashes the same way as a new booking."
              : "Book a common-area space for your own use — a family gathering, a hobby group, anything that isn't already covered by Show Time, Social, or Groups & Clubs."}
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Date</label>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={INPUT} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <div style={{ ...FIELD, flex: 1 }}>
              <label style={LABEL}>Start</label>
              <TimeField
                value={startTime} onChange={handleStartChange} colour={startTime ? "var(--green)" : "var(--border)"}
                hourFloor={SPACE_HOUR_FLOOR} hourCeil={SPACE_HOUR_CEIL} disabledSlots={busySlots}
              />
            </div>
            <div style={{ ...FIELD, flex: 1 }}>
              <label style={LABEL}>End</label>
              <TimeField
                value={endTime} onChange={setEndTime} colour={endTime && endTime > startTime ? "var(--green)" : "var(--danger)"}
                minHour={startTime ? Number(startTime.split(":")[0]) : null}
                hourFloor={SPACE_HOUR_FLOOR} hourCeil={SPACE_HOUR_CEIL} disabledSlots={endDisabledSlots}
              />
            </div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "-0.9rem", marginBottom: "1rem" }}>
            Spaces can be booked between 8am and 10pm. Times already booked are greyed out.
          </div>
          {startTime && endTime && endTime <= startTime && (
            <div style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "-0.75rem", marginBottom: "1rem" }}>
              End time must be after the start time.
            </div>
          )}

          {windowValid && !wantChangeSpace && selectedLocation && (
            <div style={FIELD}>
              <label style={LABEL}>Space</label>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                padding: "0.7rem 0.9rem", borderRadius: 10, border: "1px solid var(--teal)", background: "var(--surface2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                  {selectedLocation.image_url && (
                    <img src={selectedLocation.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{selectedLocation.name}</span>
                  {selectedLocation.request_only && (
                    <span style={{ fontSize: "0.66rem", fontWeight: 700, padding: "0.12rem 0.4rem", borderRadius: 6,
                      background: "var(--amber)1f", color: "var(--amber-dark)", whiteSpace: "nowrap" }}>Request Only</span>
                  )}
                </div>
                <button type="button" onClick={() => setWantChangeSpace(true)}
                  style={{ background: "none", border: "none", color: "var(--teal)", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  Change
                </button>
              </div>
            </div>
          )}

          {windowValid && wantChangeSpace && (
            <div style={FIELD}>
              <label style={LABEL}>Space</label>
              {locationsLoading ? (
                <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", padding: "0.6rem 0" }}>Checking what's free…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(locations || []).map(loc => (
                    <button
                      key={loc.id}
                      type="button"
                      disabled={!loc.available}
                      onClick={() => { if (loc.available) { setLocationId(loc.id); setWantChangeSpace(false) } }}
                      style={{
                        textAlign: "left", padding: "0.7rem 0.9rem", borderRadius: 10,
                        border: `1px solid ${locationId === loc.id ? "var(--teal)" : "var(--border)"}`,
                        background: locationId === loc.id ? "var(--surface2)" : "var(--surface)",
                        cursor: loc.available ? "pointer" : "not-allowed",
                        opacity: loc.available ? 1 : 0.55,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
                        {loc.image_url && (
                          <img src={loc.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <span style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>{loc.name}</span>
                        {loc.request_only && (
                          <span style={{ fontSize: "0.66rem", fontWeight: 700, padding: "0.12rem 0.4rem", borderRadius: 6,
                            background: "var(--amber)1f", color: "var(--amber-dark)", whiteSpace: "nowrap" }}>Request Only</span>
                        )}
                        {locationId === loc.id && <span style={{ color: "var(--teal)" }}>✓</span>}
                      </div>
                      {!loc.available && loc.reason && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>{loc.reason}</div>
                      )}
                    </button>
                  ))}
                  {locations && locations.length === 0 && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No bookable spaces found.</div>
                  )}
                  {locations && locations.length > 0 && !locations.some(l => l.available) && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      Nothing's free for that window — try a different time.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {needsIngeniaConfirmation && (
            <div style={{ ...FIELD, background: "var(--amber)0f", border: "1px solid var(--amber)", borderRadius: 10, padding: "0.85rem 0.9rem" }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.65rem", lineHeight: 1.4 }}>
                <strong>{selectedLocation?.name}</strong> is Request Only. Ingenia decides based on whether this is
                community-based rather than personal use — you'll need their OK before booking it.
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", marginBottom: ingeniaConfirmed ? "0.75rem" : 0 }}>
                <input type="checkbox" checked={ingeniaConfirmed} onChange={e => setIngeniaConfirmed(e.target.checked)}
                  style={{ marginTop: "0.15rem", width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                  I've confirmed with the Ingenia Community Manager that I can book this space.
                </span>
              </label>
              {ingeniaConfirmed && (
                <div>
                  <label style={LABEL}>Who confirmed this?</label>
                  <input
                    value={ingeniaConfirmedBy}
                    onChange={e => setIngeniaConfirmedBy(e.target.value.slice(0, INGENIA_CONFIRMED_BY_MAX))}
                    placeholder="e.g. Jane at Ingenia"
                    style={INPUT}
                  />
                </div>
              )}
            </div>
          )}

          {locationId && (
            <div style={FIELD}>
              <label style={LABEL}>What's it for?</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, BOOKING_REASON_MAX))}
                placeholder="e.g. Family birthday lunch"
                rows={3}
                style={{ ...INPUT, resize: "vertical" }}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.3rem", textAlign: "right" }}>
                {BOOKING_REASON_MAX - reasonTrimmed.length} characters left
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "var(--danger-bg, #fdecea)", color: "var(--danger)", border: "1px solid var(--danger)",
              borderRadius: 10, padding: "0.7rem 0.9rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: "var(--teal)", color: "#fff", border: "none", borderRadius: 10,
              padding: "0.85rem 1.5rem", fontWeight: 700, fontSize: "0.95rem", width: "100%",
              cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5, marginBottom: "1.5rem",
            }}
          >
            {submitting ? (isEdit ? "Saving…" : "Booking…") : (isEdit ? "Save changes" : "Book this space")}
          </button>
        </div>
        )}
      </div>
    </Portal>
    {SameDateModal}
    </>
  )
}
