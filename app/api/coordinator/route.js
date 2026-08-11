import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { promoteWaitlist } from "@/lib/promoteWaitlist"
import { notify } from "@/lib/notify"
import { validateParty } from "@/lib/attendees"
import { bookingsClosed } from "@/lib/booking"
import { fetchTakenResidentIds } from "@/lib/takenResidents"
import { syncAttendees } from "@/lib/syncAttendees"
import { maxSeatsPerBooking, planSeatModification } from "@/lib/modifyBooking"
import { requireEventManage } from "@/lib/areaAuth"
import { amountOwing, derivePaymentStatus } from "@/lib/payments"

// force-dynamic + the shared no-store supabaseAdmin (lib/supabaseAdmin.js) keep
// this GET route reading LIVE data. Without it, Next's fetch cache once dropped a
// just-added screening from the calendar (2026-07-19).
export const dynamic = "force-dynamic"

// Resolve calling member and verify they can manage this event: admin, this
// event's own hub/club Owner (area-wide -- added 2026-08-10, see
// lib/areaAuth.js), or an active EC for this specific event.
async function resolveEC(req, eventId) {
  return requireEventManage(req, eventId)
}

// ─── GET /api/coordinator?event_id=… ─────────────────────────────────────────
// Returns attendees + refund-due list for the event (EC/admin only)
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("event_id")
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const { error, status, member } = await resolveEC(req, eventId)
  if (error) return NextResponse.json({ error }, { status })

  // Fetch active bookings for the event
  const { data: activeBookings, error: be } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, amount_paid, refund_due, refund_paid_at, has_book, book_given_at, name_hidden, booked_at, bring_note, member_id, contact_id, members(id, name, username, hide_name), contacts(id, name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("booked_at")

  if (be) return NextResponse.json({ error: be.message }, { status: 500 })

  // Also fetch cancelled bookings that have payment info (refund pending or issued)
  const { data: cancelledPayments } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, amount_paid, refund_due, refund_paid_at, has_book, book_given_at, name_hidden, booked_at, bring_note, member_id, contact_id, members(id, name, username, hide_name), contacts(id, name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .in("payment_status", ["confirmed", "refunded"])
    .order("booked_at")

  // Also fetch cancelled bookings where the book is still out — cancelling attendance
  // doesn't clear book status (per Book Club scope), so these must stay visible to
  // the EC/admin attendee list rather than silently disappearing.
  const { data: cancelledWithBook } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, has_book, book_given_at, name_hidden, booked_at, bring_note, member_id, contact_id, members(id, name, username, hide_name), contacts(id, name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .eq("has_book", true)
    .order("book_given_at")

  const bookings = activeBookings || []
  // Unified refund ledger (2026-08-11) -- refund_due/refund_paid_at covers
  // BOTH sources: a cancelled booking that had been paid (still selected
  // above via the old payment_status IN ('confirmed','refunded') filter,
  // which also catches every pre-migration row the backfill populated),
  // and an overpayment on a still-ACTIVE confirmed booking (bookings, not
  // cancelledPayments -- the booking itself never got cancelled). See
  // lib/payments.js's isRefundPending/isRefundIssued for the shared
  // backward-compat-aware check.
  const activeOverpaid = bookings.filter(b => (parseFloat(b.refund_due) || 0) > 0)
  const refundPending  = [...activeOverpaid, ...(cancelledPayments || [])]
    .filter(b => (parseFloat(b.refund_due) || 0) > 0 && !b.refund_paid_at && b.payment_status !== "refunded")
  const refundIssued   = (cancelledPayments || []).filter(b => b.refund_paid_at || b.payment_status === "refunded")
  const cancelledBookOut = cancelledWithBook || []

  // Fetch EC notes for the event
  const { data: event } = await supa
    .from("events")
    .select("coordinator_notes, description, welcome_message, payment_required, cost, has_dining, menu_type, menu_text, menu_url, menu_file_name, image_focal_x, image_focal_y")
    .eq("id", eventId)
    .maybeSingle()

  return NextResponse.json({
    bookings,
    refund_pending: refundPending,
    refund_issued: refundIssued,
    cancelled_book_out: cancelledBookOut,
    coordinator_notes: event?.coordinator_notes || null,
    description: event?.description || null,
    welcome_message: event?.welcome_message || null,
    payment_required: event?.payment_required || false,
    cost: event?.cost || null,
    has_dining: event?.has_dining || false,
    menu_type: event?.menu_type || null,
    menu_text: event?.menu_text || null,
    menu_url: event?.menu_url || null,
    menu_file_name: event?.menu_file_name || null,
    image_focal_x: event?.image_focal_x ?? 50,
    image_focal_y: event?.image_focal_y ?? 50,
  })
}

// Seat-level FIFO waitlist promotion now lives in lib/promoteWaitlist.js,
// shared with app/api/bookings/route.js (2026-07-12). This file's copy used
// to only promote a waiter if their *entire* seat count fit in the freed
// capacity (no partial/split promotion), unlike the self-cancel path -- an
// EC cancelling a booking could leave seats unfilled that a resident
// cancelling their own booking would have filled. Unified so both behave
// the same.

// ─── PATCH /api/coordinator ───────────────────────────────────────────────────
// Multi-purpose: update payment, refund, EC notes, event description/welcome, cancel booking
export async function PATCH(req) {
  const body = await req.json()
  const {
    event_id, action, booking_id, payment_status, refunded,
    coordinator_notes, description, welcome_message,
    has_dining, menu_type, menu_text, image_focal_x, image_focal_y,
    has_book, name_hidden,
  } = body

  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const { error, status, member } = await resolveEC(req, event_id)
  if (error) return NextResponse.json({ error }, { status })

  // ── Record a payment on a booking ─────────────────────────────────────────
  // Reworked 2026-08-11 (see Partial_Payment_Scope_Document_v2) -- the EC's
  // real input is now an AMOUNT, not a status. "Mark Paid" from the UI
  // sends payment_status: "confirmed" with the amount actually received
  // (defaults to the full amount owed if omitted, so the old "just flip it
  // to confirmed" call sites -- e.g. any cached client -- still work); the
  // status is DERIVED from that amount (lib/payments.js's
  // derivePaymentStatus), never trusted as-is, so a short amount lands on
  // 'partial' and an amount over what's owed still lands on 'confirmed'
  // with the excess pushed into the refund ledger (refund_due), never a
  // distinct "overpaid" status (Iain's explicit call -- "Partial" only
  // ever means short). "Mark Unpaid" (payment_status: "pending") stays a
  // plain correction with no amount, exactly as before.
  if (action === "set_payment" && booking_id) {
    if (!["not_required", "pending", "submitted", "confirmed", "refunded"].includes(payment_status)) {
      return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 })
    }
    const { amount: rawAmount, note } = body
    // Fetch previous state first so we only notify on an actual transition,
    // not every toggle (e.g. Confirmed -> Pending if corrected by mistake).
    const { data: prevBk } = await supa
      .from("bookings").select("payment_status, member_id, seats, payment_submitted_at, payment_notes, amount_paid")
      .eq("id", booking_id).maybeSingle()
    if (!prevBk) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

    let patch, effectiveStatus, refundDelta = 0, owed = 0
    if (payment_status === "confirmed") {
      const { data: ev } = await supa.from("events").select("cost").eq("id", event_id).single()
      owed = amountOwing(ev, prevBk.seats)
      // Balance-based (2026-08-11 follow-up, Iain -- Spring Ball): `amount`
      // is the payment being recorded IN THIS transaction, not a new
      // absolute total -- it gets ADDED to whatever's already on file.
      // Blank defaults to the outstanding balance (owed - existing), not
      // the full amount owed, so re-opening an already-partial booking's
      // toggle offers the actual remaining $ rather than double-charging
      // the amount already recorded. For a fresh booking (existing = 0)
      // this is identical to the old "defaults to full owed" behaviour.
      const existingPaid = Number(prevBk.amount_paid) || 0
      const increment = (rawAmount !== undefined && rawAmount !== null && rawAmount !== "")
        ? Math.max(0, parseFloat(rawAmount) || 0) : Math.max(0, owed - existingPaid)
      const amountPaid = existingPaid + increment
      effectiveStatus = derivePaymentStatus(amountPaid, owed)
      patch = { payment_status: effectiveStatus, amount_paid: amountPaid, updated_at: new Date().toISOString() }
      if (amountPaid > owed) refundDelta = amountPaid - owed
      if (note) {
        // Logs the amount recorded THIS transaction, not the resulting
        // running total (amountPaid) -- each entry should read as "what
        // happened", same as a bank statement line, not a repeated balance.
        patch.payment_notes = [...(prevBk.payment_notes || []),
          { amount: increment, note, recorded_by: member.id, recorded_at: new Date().toISOString() }]
      }
    } else {
      // An EC un-confirming payment (-> "pending") must not silently discard a
      // resident's own "I've Paid" self-report -- restore 'submitted' instead
      // when one is on record (migration 076). Only applies to the "pending"
      // direction; an explicit refund/not_required/etc is left as sent (Iain,
      // 2026-08-04: "the setting back on my booking reverts to unpaid as well,
      // but SHOULD remain as I set it, which was I've Paid").
      effectiveStatus = (payment_status === "pending" && prevBk?.payment_submitted_at)
        ? "submitted" : payment_status
      patch = { payment_status: effectiveStatus, amount_paid: 0, updated_at: new Date().toISOString() }
    }
    if (refundDelta > 0) { patch.refund_due = refundDelta; patch.refund_paid_at = null }

    const { error: pe } = await supa
      .from("bookings")
      .update(patch)
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })

    if (effectiveStatus !== prevBk?.payment_status && prevBk?.member_id) {
      const { data: ev } = await supa.from("events").select("title, cost").eq("id", event_id).single()
      const title = ev?.title || "this event"
      const owedNow = owed || amountOwing(ev, prevBk.seats)
      let msg, type = "payment_confirmed"
      if (effectiveStatus === "partial") {
        type = "payment_partial"
        msg = `$${(patch.amount_paid || 0).toFixed(2)} of $${owedNow.toFixed(2)} received for ${title} — $${(owedNow - (patch.amount_paid || 0)).toFixed(2)} still owing.`
      } else if (effectiveStatus === "confirmed") {
        msg = refundDelta > 0
          ? `Your payment for ${title} has been confirmed — $${refundDelta.toFixed(2)} overpaid, a refund is due back to you.`
          : `Your payment for ${title} has been confirmed.`
      } else {
        msg = null // reverting to pending/submitted/not_required is a correction, not notification-worthy
      }
      if (note) msg = msg ? `${msg} EC note: ${note}` : null
      if (msg) await notify(prevBk.member_id, event_id, type, msg)
    }
    return NextResponse.json({ ok: true, payment_status: effectiveStatus })
  }

  // ── Close Out payments for an event (2026-07-12) ──────────────────────────────
  // Idea 1 of Social_Hive_Event_Payments_Discussion.docx -- reconciles the
  // event's payments (stamps who/when) and sends a payment_reminder
  // notification to every confirmed booking still unpaid at this moment.
  // Re-runnable: if new unpaid bookings appear later (e.g. a waitlist
  // promotion after the first close-out), running it again just reminds
  // whoever is still outstanding then and updates the stamp -- it is not a
  // one-shot lock on the event.
  if (action === "close_out_payments") {
    const { data: ev } = await supa
      .from("events").select("title, cost, payment_required").eq("id", event_id).single()
    if (!ev?.payment_required) {
      return NextResponse.json({ error: "This event doesn't require payment" }, { status: 400 })
    }
    const { data: confirmedRows } = await supa
      .from("bookings")
      .select("id, member_id, seats, payment_status")
      .eq("event_id", event_id).eq("status", "confirmed")

    const unpaid = (confirmedRows || []).filter(b => b.payment_status !== "confirmed" && b.payment_status !== "refunded")
    const cost = parseFloat(ev.cost) || 0

    for (const b of unpaid) {
      const owed = (cost * (b.seats || 1)).toFixed(2)
      await notify(b.member_id, event_id, "payment_reminder",
        `Reminder: $${owed} is still owing for ${ev.title || "this event"}.`)
    }

    await supa.from("events").update({
      payments_reconciled_at: new Date().toISOString(),
      payments_reconciled_by: member.id,
    }).eq("id", event_id)

    return NextResponse.json({ ok: true, reminded: unpaid.length })
  }

  // ── Remind a single unpaid attendee (2026-07-12) ─────────────────────────────
  // Idea 3 of Social_Hive_Event_Payments_Discussion.docx -- a per-attendee
  // one-tap nudge, distinct from Close Out's bulk "remind everyone unpaid".
  // Same payment_reminder notification type and message format as Close
  // Out for consistency, just scoped to one booking and not tied to the
  // event's reconciled stamp.
  if (action === "remind_payment" && booking_id) {
    const { data: ev } = await supa
      .from("events").select("title, cost, payment_required").eq("id", event_id).single()
    if (!ev?.payment_required) {
      return NextResponse.json({ error: "This event doesn't require payment" }, { status: 400 })
    }
    const { data: bk } = await supa
      .from("bookings").select("id, member_id, seats, status, payment_status")
      .eq("id", booking_id).eq("event_id", event_id).maybeSingle()
    if (!bk || bk.status !== "confirmed") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }
    if (bk.payment_status === "confirmed" || bk.payment_status === "refunded") {
      return NextResponse.json({ error: "This booking isn't awaiting payment" }, { status: 400 })
    }
    const cost = parseFloat(ev.cost) || 0
    const owed = (cost * (bk.seats || 1)).toFixed(2)
    await notify(bk.member_id, event_id, "payment_reminder",
      `Reminder: $${owed} is still owing for ${ev.title || "this event"}.`)

    return NextResponse.json({ ok: true })
  }

  // ── Remind a single attendee to return their Book Club copy (2026-07-15) ────
  // Manual counterpart to the automatic overdue cron
  // (app/api/cron/book-return-check/route.js) -- an EC/admin can nudge
  // anyone currently holding a copy (has_book = true) at any time, not just
  // once it's overdue. Stamps book_return_reminded_at so the cron doesn't
  // immediately re-fire the same day right after a manual nudge.
  if (action === "remind_book_return" && booking_id) {
    const { data: bk } = await supa
      .from("bookings").select("id, member_id, has_book")
      .eq("id", booking_id).eq("event_id", event_id).maybeSingle()
    if (!bk) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    if (!bk.has_book) return NextResponse.json({ error: "This attendee doesn't currently have a book out" }, { status: 400 })

    const { data: ev } = await supa
      .from("events").select("title, book_return_date, book_id, book_snapshot, books(title)")
      .eq("id", event_id).maybeSingle()
    const bookTitle = ev?.books?.title || ev?.book_snapshot?.title || ev?.title || "this book"
    let dueText = ""
    if (ev?.book_return_date) {
      const [y, m, d] = ev.book_return_date.split("-").map(Number)
      dueText = ` (due back ${new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })})`
    }

    await notify(bk.member_id, event_id, "book_return_reminder",
      `Reminder: please return your copy of "${bookTitle}" to the coordinator${dueText}.`)
    await supa.from("bookings").update({ book_return_reminded_at: new Date().toISOString() }).eq("id", booking_id)

    return NextResponse.json({ ok: true })
  }

  // ── Acknowledge a refund was paid out ─────────────────────────────────────
  // Renamed from "set_refund" and reworked 2026-08-11 -- ONE ledger for
  // refund_due now covers both a cancelled-and-was-paid booking AND an
  // overpayment on a still-active one (see lib/payments.js and the
  // migration comment), so this action just stamps/clears refund_paid_at
  // rather than flipping payment_status between 'refunded' and 'pending'
  // -- that flip used to be the only refund record at all: no amount, no
  // date. `refunded: false` (the "Unmark" control) clears the stamp.
  if (action === "mark_refund_paid" && booking_id) {
    const { data: bk } = await supa
      .from("bookings").select("member_id, refund_due").eq("id", booking_id).eq("event_id", event_id).maybeSingle()
    if (!bk) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    const markPaid = refunded !== false
    const { error: re } = await supa
      .from("bookings")
      .update({ refund_paid_at: markPaid ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (re) return NextResponse.json({ error: re.message }, { status: 500 })
    // Tell the member their refund has been processed (only when marking one,
    // not when un-marking). A booking change they didn't initiate.
    if (markPaid && bk?.member_id && (parseFloat(bk.refund_due) || 0) > 0) {
      const { data: ev } = await supa.from("events").select("title").eq("id", event_id).single()
      await notify(bk.member_id, event_id, "payment_refunded",
        `Your $${parseFloat(bk.refund_due).toFixed(2)} refund for ${ev?.title || "this event"} has been processed.`)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Toggle whether this attendee currently holds the physical Book Club kit ──
  // Turning it on stamps book_given_at = now. Turning off is manual only — per
  // scope, nothing auto-clears this (not a cancelled booking, not the return date).
  if (action === "set_has_book" && booking_id) {
    const patch = { has_book: !!has_book }
    if (has_book) patch.book_given_at = new Date().toISOString()
    const { error: hbe } = await supa
      .from("bookings")
      .update(patch)
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (hbe) return NextResponse.json({ error: hbe.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Toggle whether this attendee's name is hidden in the attendee list ───────
  if (action === "set_name_hidden" && booking_id) {
    const { error: nhe } = await supa
      .from("bookings")
      .update({ name_hidden: !!name_hidden })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (nhe) return NextResponse.json({ error: nhe.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Add a walk-up booking on behalf of a resident (2026-07-13; extended
  // 2026-07-23 for residents with no app login) ───────────────────────────
  // For residents who don't use the app and turn up in person (often with
  // cash) asking to join. EC/admin picks the resident via live search in the
  // shared CoordinatorPanel (components/EventSlideOut.js) rather than the
  // resident going through /api/bookings themselves. Mirrors the self-book
  // capacity check in app/api/bookings/route.js POST, but does NOT auto-split
  // seats across confirmed/waitlist -- if requested seats don't fit, this
  // returns `insufficient_capacity` and the caller must explicitly resubmit
  // with force_status: "waitlist" (simpler and more predictable for a manual
  // admin action than mirroring the resident-facing split-offer dialog).
  //
  // The target resident is either a `members` row (member_id, has an app
  // account) or a `contacts` row (contact_id, no login -- e.g. added via
  // Info > Contacts). Exactly one must be given. A contact-owned booking has
  // no account to notify/push, and no book-return history to check against
  // (that guard is member-only, by design -- see below).
  if (action === "add_booking") {
    const { member_id, contact_id, seats: rawSeats, mark_paid, force_status, attendees: rawAttendees } = body
    if (!member_id && !contact_id) return NextResponse.json({ error: "member_id or contact_id required" }, { status: 400 })
    if (member_id && contact_id) return NextResponse.json({ error: "Provide only one of member_id or contact_id" }, { status: 400 })

    let targetName
    if (member_id) {
      const { data: targetMember } = await supa
        .from("members").select("id, name").eq("id", member_id).maybeSingle()
      if (!targetMember) return NextResponse.json({ error: "Resident not found" }, { status: 404 })
      targetName = targetMember.name
    } else {
      const { data: targetContact } = await supa
        .from("contacts").select("id, name").eq("id", contact_id).eq("active", true).maybeSingle()
      if (!targetContact) return NextResponse.json({ error: "Resident not found" }, { status: 404 })
      targetName = targetContact.name
    }

    const { data: ev } = await supa
      .from("events").select("id, max_seats, max_seats_per_booking, hub_type, book_id, payment_required, title, allow_nonresident_guests, require_attendee_names")
      .eq("id", event_id).single()
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 })

    // Cap reads the event's own max_seats_per_booking instead of a
    // hardcoded 4 (2026-08-08) -- see lib/modifyBooking.js.
    const seats = Math.min(maxSeatsPerBooking(ev), Math.max(1, parseInt(rawSeats) || 1))

    // Named party for this walk-up booking (2026-07-23), same identity rules
    // as self-service naming -- a resident (member or contact) or, only if
    // the event allows it, a guest. Unlike self-service, naming stays
    // OPTIONAL here: an EC can still book N anonymous seats for someone
    // (the pre-existing behaviour, e.g. "3 people showed up, not sure of
    // every name") by simply not sending `attendees` at all. If they DO
    // send it, it's validated the same way self-service is -- all-or-nothing,
    // not half-named.
    let party = { ok: true, attendees: [] }
    if (rawAttendees !== undefined) {
      const { memberIds: takenMemberIds, contactIds: takenContactIds } = await fetchTakenResidentIds(event_id, {
        excludeOwnerId: member_id || null, excludeOwnerContactId: contact_id || null,
      })
      party = validateParty({
        seats, attendees: rawAttendees, allowGuests: !!ev.allow_nonresident_guests,
        ownerId: member_id || null, ownerContactId: contact_id || null,
        takenMemberIds, takenContactIds,
        required: !!ev.require_attendee_names,
      })
      if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })
    }

    // Same "still has a Book Club kit checked out" guard as self-book.
    // Contacts have no booking history tied to a login, so this only applies
    // to member_id bookings.
    if (member_id && ev.hub_type === "bookclub" && ev.book_id) {
      const { data: outstandingRows } = await supa
        .from("bookings")
        .select("id, book_given_at, events(book_id, title, books(title))")
        .eq("member_id", member_id).eq("has_book", true)
        .order("book_given_at", { ascending: false }).limit(1)
      const outstanding = outstandingRows?.[0]
      if (outstanding?.events?.book_id && outstanding.events.book_id !== ev.book_id) {
        const title = outstanding.events.books?.title || outstanding.events.title || "a book"
        return NextResponse.json({
          error: `${targetName} still has "${title}" checked out — return it before joining a different book.`,
        }, { status: 409 })
      }
    }

    let existingQuery = supa.from("bookings").select("id")
      .eq("event_id", event_id).neq("status", "cancelled")
    existingQuery = member_id ? existingQuery.eq("member_id", member_id) : existingQuery.eq("contact_id", contact_id)
    const { data: existingActive } = await existingQuery.maybeSingle()
    if (existingActive) {
      return NextResponse.json({ error: `${targetName} already has a booking for this event` }, { status: 409 })
    }

    const { data: allBookings } = await supa
      .from("bookings").select("seats, status").eq("event_id", event_id).neq("status", "cancelled")
    const confirmedSeats = (allBookings || [])
      .filter(b => b.status === "confirmed").reduce((s, b) => s + (b.seats || 1), 0)
    const available = Math.max(0, (ev.max_seats || 0) - confirmedSeats)

    let bookingStatus
    if (force_status === "waitlist") bookingStatus = "waitlist"
    else if (seats <= available) bookingStatus = "confirmed"
    else return NextResponse.json({ status: "insufficient_capacity", available })

    const payment_status = !ev.payment_required ? "not_required"
      : bookingStatus === "confirmed" ? (mark_paid ? "confirmed" : "pending")
      : "pending"

    const { error: insErr } = await supa.from("bookings").insert({
      event_id, member_id: member_id || null, contact_id: contact_id || null, seats, status: bookingStatus,
      booked_at: new Date().toISOString(), payment_status,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    if (rawAttendees !== undefined) {
      await syncAttendees(event_id, { ownerId: member_id || null, ownerContactId: contact_id || null }, party.attendees)
    }

    // No account to notify/push for a contact-owned booking.
    if (member_id) {
      await notify(member_id, event_id, "booking_added",
        `You were added to ${ev.title || "an event"} (${seats} seat${seats !== 1 ? "s" : ""}) by an Event Coordinator.`)
    }

    return NextResponse.json({ ok: true, status: bookingStatus })
  }

  // ── Cancel a booking on behalf of a user ──────────────────────────────────
  if (action === "cancel_booking" && booking_id) {
    // Fetch booking first so we know seats freed (for waitlist promotion) and who to notify
    const { data: bk } = await supa
      .from("bookings").select("status, seats, member_id, payment_status, amount_paid").eq("id", booking_id).maybeSingle()
    const cancelPatch = { status: "cancelled", updated_at: new Date().toISOString() }
    // A booking that had money against it (fully paid OR partial) owes that
    // amount back the moment it's cancelled -- populate the refund ledger
    // here rather than waiting for an EC to notice and flag it manually
    // (2026-08-11, unifying with the overpayment refund path above).
    const amountAlreadyPaid = parseFloat(bk?.amount_paid) || 0
    if ((bk?.payment_status === "confirmed" || bk?.payment_status === "partial") && amountAlreadyPaid > 0) {
      cancelPatch.refund_due = amountAlreadyPaid
      cancelPatch.refund_paid_at = null
    }
    const { error: ce } = await supa
      .from("bookings")
      .update(cancelPatch)
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
    // Promote waitlisted members if a confirmed seat was freed
    if (bk?.status === "confirmed") {
      await promoteWaitlist(event_id)
    }
    if (bk?.member_id) {
      const { data: ev } = await supa.from("events").select("title").eq("id", event_id).single()
      await notify(bk.member_id, event_id, "booking_cancelled", `Your booking for ${ev?.title || "this event"} was cancelled.`, undefined, member.id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Add/remove seats on an existing booking, on the resident's behalf ─────
  // Iain, 2026-08-08: an EC/admin previously could only Cancel a booking
  // from this panel -- no way to amend it. This is the same rule set a
  // resident gets modifying their own booking (lib/modifyBooking.js's
  // planSeatModification, shared with self-service PATCH /api/bookings so
  // the two can't drift the way promoteWaitlist once did), extended to also
  // cover contact-owned walk-up bookings, which residents can never touch
  // themselves since they have no login. If the booking is already split
  // across confirmed + waitlist, growing it is refused outright -- the
  // caller (EventSlideOut.js) is expected to tell the admin to cancel and
  // rebook instead, same as the error message says.
  if (action === "modify_booking") {
    const { member_id: ownerId, contact_id: ownerContactId, seats: rawSeats, attendees: rawAttendees } = body
    if (!ownerId && !ownerContactId) {
      return NextResponse.json({ error: "member_id or contact_id required" }, { status: 400 })
    }
    if (ownerId && ownerContactId) {
      return NextResponse.json({ error: "Provide only one of member_id or contact_id" }, { status: 400 })
    }

    const { data: ev } = await supa
      .from("events").select("id, title, max_seats, max_seats_per_booking, payment_required, reservation_cutoff, allow_nonresident_guests, require_attendee_names")
      .eq("id", event_id).single()
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 })

    let ownerQuery = supa.from("bookings").select("id, status, seats")
      .eq("event_id", event_id).neq("status", "cancelled")
    ownerQuery = ownerId ? ownerQuery.eq("member_id", ownerId) : ownerQuery.eq("contact_id", ownerContactId)
    const { data: ownerBookings } = await ownerQuery
    const myConfirmed = (ownerBookings || []).find(b => b.status === "confirmed")
    const myWaitlist  = (ownerBookings || []).find(b => b.status === "waitlist")
    if (!myConfirmed) return NextResponse.json({ error: "No confirmed booking found for this resident" }, { status: 404 })

    const { data: confirmedRows } = await supa
      .from("bookings").select("seats")
      .eq("event_id", event_id).eq("status", "confirmed").neq("id", myConfirmed.id)
    const othersConfirmed = (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)

    const plan = planSeatModification({
      event: ev, requestedSeats: rawSeats,
      oldConfirmed: myConfirmed.seats || 1, oldWaitlisted: myWaitlist?.seats || 0,
      othersConfirmed, closed: bookingsClosed(ev),
    })
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error, ...(plan.code === "bookings_closed" ? { bookings_closed: true } : {}) }, { status: 409 })
    }

    // Re-validate the named party against the new seat count -- same rule
    // self-service gets, excluding this booking's own owner/party from the
    // "already booked elsewhere on this event" check.
    const { memberIds: takenMemberIds, contactIds: takenContactIds } = await fetchTakenResidentIds(event_id, {
      excludeOwnerId: ownerId || null, excludeOwnerContactId: ownerContactId || null,
    })
    const party = validateParty({
      seats: plan.seats, attendees: rawAttendees,
      allowGuests: !!ev.allow_nonresident_guests,
      ownerId: ownerId || null, ownerContactId: ownerContactId || null,
      takenMemberIds, takenContactIds,
      required: !!ev.require_attendee_names,
    })
    if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 })

    if (myWaitlist) {
      await supa.from("bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", myWaitlist.id)
    }

    const { error: updErr } = await supa
      .from("bookings").update({ seats: plan.newConfirmed, updated_at: new Date().toISOString() })
      .eq("id", myConfirmed.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    if (plan.newConfirmed < (myConfirmed.seats || 1)) {
      await promoteWaitlist(event_id)
    }

    if (plan.newWaitlisted > 0) {
      const { error: insErr } = await supa.from("bookings").insert({
        event_id, member_id: ownerId || null, contact_id: ownerContactId || null,
        seats: plan.newWaitlisted, status: "waitlist", booked_at: new Date().toISOString(),
        payment_status: ev.payment_required ? "pending" : "not_required",
      })
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // rawAttendees is always sent by the panel (fully seeded from the
    // existing party, same pattern as self-service Modify) so this always
    // runs when the action succeeds -- mirrors PATCH /api/bookings, which
    // does the same unconditionally.
    await syncAttendees(event_id, { ownerId: ownerId || null, ownerContactId: ownerContactId || null }, party.attendees)

    // No account to notify for a contact-owned (no-login) booking.
    if (ownerId) {
      await notify(ownerId, event_id, "booking_updated",
        `Your booking for ${ev.title || "this event"} was changed to ${plan.seats} seat${plan.seats !== 1 ? "s" : ""} by an Event Coordinator.`,
        undefined, member.id)
    }

    return NextResponse.json({ ok: true, seats: plan.seats, confirmed: plan.newConfirmed, waitlisted: plan.newWaitlisted })
  }

  // ── Update EC-editable event fields ──────────────────────────────────────────
  if (action === "update_event") {
    const patch = {}
    if (coordinator_notes !== undefined) patch.coordinator_notes = coordinator_notes
    if (description !== undefined) patch.description = description
    if (welcome_message !== undefined) patch.welcome_message = welcome_message
    if (has_dining !== undefined) patch.has_dining = has_dining
    if (menu_type !== undefined) {
      if (menu_type !== null && !["text", "file"].includes(menu_type)) {
        return NextResponse.json({ error: "Invalid menu_type" }, { status: 400 })
      }
      patch.menu_type = menu_type
    }
    if (menu_text !== undefined) patch.menu_text = menu_text
    if (image_focal_x !== undefined) patch.image_focal_x = image_focal_x
    if (image_focal_y !== undefined) patch.image_focal_y = image_focal_y
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const { error: ue } = await supa.from("events").update(patch).eq("id", event_id)
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
