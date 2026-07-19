import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { promoteWaitlist } from "@/lib/promoteWaitlist"
import { notify } from "@/lib/notify"

// force-dynamic + the shared no-store supabaseAdmin (lib/supabaseAdmin.js) keep
// this GET route reading LIVE data. Without it, Next's fetch cache once dropped a
// just-added screening from the calendar (2026-07-19).
export const dynamic = "force-dynamic"

// Helper: resolve calling member and verify they are an active EC for the event
async function resolveEC(req, eventId) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) return { error: "Unauthenticated", status: 401 }

  const { data: { user }, error: ue } = await supa.auth.getUser(token)
  if (ue || !user) return { error: "Unauthenticated", status: 401 }

  const { data: member } = await supa
    .from("members")
    .select("id, is_admin")
    .eq("auth_id", user.id)
    .maybeSingle()
  if (!member) return { error: "Member not found", status: 403 }

  // Admins always pass; for ECs check junction table
  if (!member.is_admin) {
    const { data: ecRow } = await supa
      .from("event_coordinators")
      .select("id")
      .eq("event_id", eventId)
      .eq("member_id", member.id)
      .is("replaced_at", null)
      .maybeSingle()
    if (!ecRow) return { error: "Not a coordinator for this event", status: 403 }
  }

  return { member }
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
    .select("id, seats, status, payment_status, has_book, book_given_at, name_hidden, booked_at, bring_note, members(id, name, username, hide_name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("booked_at")

  if (be) return NextResponse.json({ error: be.message }, { status: 500 })

  // Also fetch cancelled bookings that have payment info (refund pending or issued)
  const { data: cancelledPayments } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, has_book, book_given_at, name_hidden, booked_at, bring_note, members(id, name, username, hide_name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .in("payment_status", ["confirmed", "refunded"])
    .order("booked_at")

  // Also fetch cancelled bookings where the book is still out — cancelling attendance
  // doesn't clear book status (per Book Club scope), so these must stay visible to
  // the EC/admin attendee list rather than silently disappearing.
  const { data: cancelledWithBook } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, has_book, book_given_at, name_hidden, booked_at, bring_note, members(id, name, username, hide_name), bring:club_bring_categories!bring_category_id(label)")
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .eq("has_book", true)
    .order("book_given_at")

  const bookings = activeBookings || []
  const refundPending  = (cancelledPayments || []).filter(b => b.payment_status === "confirmed")
  const refundIssued   = (cancelledPayments || []).filter(b => b.payment_status === "refunded")
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

  // ── Toggle payment status on a booking ──────────────────────────────────────
  if (action === "set_payment" && booking_id) {
    if (!["not_required", "pending", "submitted", "confirmed", "refunded"].includes(payment_status)) {
      return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 })
    }
    // Fetch previous state first so we only notify on an actual Pending -> Confirmed
    // transition, not every toggle (e.g. Confirmed -> Pending if corrected by mistake)
    const { data: prevBk } = await supa
      .from("bookings").select("payment_status, member_id").eq("id", booking_id).maybeSingle()
    const { error: pe } = await supa
      .from("bookings")
      .update({ payment_status, updated_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })
    if (payment_status === "confirmed" && prevBk?.payment_status !== "confirmed" && prevBk?.member_id) {
      const { data: ev } = await supa.from("events").select("title").eq("id", event_id).single()
      await notify(prevBk.member_id, event_id, "payment_confirmed", `Your payment for ${ev?.title || "this event"} has been confirmed.`)
    }
    return NextResponse.json({ ok: true })
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

  // ── Mark refund given on a cancelled booking ─────────────────────────────────
  if (action === "set_refund" && booking_id) {
    const { data: bk } = await supa
      .from("bookings").select("member_id, seats").eq("id", booking_id).eq("event_id", event_id).maybeSingle()
    const { error: re } = await supa
      .from("bookings")
      .update({ payment_status: refunded ? "refunded" : "pending", updated_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (re) return NextResponse.json({ error: re.message }, { status: 500 })
    // Tell the member their refund has been processed (only when marking one,
    // not when un-marking). A booking change they didn't initiate.
    if (refunded && bk?.member_id) {
      const { data: ev } = await supa.from("events").select("title, cost").eq("id", event_id).single()
      const owed = ev?.cost ? (parseFloat(ev.cost) * (bk.seats || 1)).toFixed(2) : null
      await notify(bk.member_id, event_id, "payment_refunded",
        `Your${owed ? ` $${owed}` : ""} refund for ${ev?.title || "this event"} has been processed.`)
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

  // ── Add a walk-up booking on behalf of a resident (2026-07-13) ──────────────
  // For residents who don't use the app and turn up in person (often with
  // cash) asking to join. EC/admin picks the resident via live search in the
  // shared CoordinatorPanel (components/EventSlideOut.js) rather than the
  // resident going through /api/bookings themselves. Mirrors the self-book
  // capacity check in app/api/bookings/route.js POST, but does NOT auto-split
  // seats across confirmed/waitlist -- if requested seats don't fit, this
  // returns `insufficient_capacity` and the caller must explicitly resubmit
  // with force_status: "waitlist" (simpler and more predictable for a manual
  // admin action than mirroring the resident-facing split-offer dialog).
  if (action === "add_booking") {
    const { member_id, seats: rawSeats, mark_paid, force_status } = body
    if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 })
    const seats = Math.min(4, Math.max(1, parseInt(rawSeats) || 1))

    const { data: targetMember } = await supa
      .from("members").select("id, name").eq("id", member_id).maybeSingle()
    if (!targetMember) return NextResponse.json({ error: "Resident not found" }, { status: 404 })

    const { data: ev } = await supa
      .from("events").select("id, max_seats, hub_type, book_id, payment_required, title")
      .eq("id", event_id).single()
    if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 })

    // Same "still has a Book Club kit checked out" guard as self-book.
    if (ev.hub_type === "bookclub" && ev.book_id) {
      const { data: outstandingRows } = await supa
        .from("bookings")
        .select("id, book_given_at, events(book_id, title, books(title))")
        .eq("member_id", member_id).eq("has_book", true)
        .order("book_given_at", { ascending: false }).limit(1)
      const outstanding = outstandingRows?.[0]
      if (outstanding?.events?.book_id && outstanding.events.book_id !== ev.book_id) {
        const title = outstanding.events.books?.title || outstanding.events.title || "a book"
        return NextResponse.json({
          error: `${targetMember.name} still has "${title}" checked out — return it before joining a different book.`,
        }, { status: 409 })
      }
    }

    const { data: existingActive } = await supa
      .from("bookings").select("id")
      .eq("event_id", event_id).eq("member_id", member_id).neq("status", "cancelled").maybeSingle()
    if (existingActive) {
      return NextResponse.json({ error: `${targetMember.name} already has a booking for this event` }, { status: 409 })
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
      event_id, member_id, seats, status: bookingStatus,
      booked_at: new Date().toISOString(), payment_status,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    await notify(member_id, event_id, "booking_added",
      `You were added to ${ev.title || "an event"} (${seats} seat${seats !== 1 ? "s" : ""}) by an Event Coordinator.`)

    return NextResponse.json({ ok: true, status: bookingStatus })
  }

  // ── Cancel a booking on behalf of a user ──────────────────────────────────
  if (action === "cancel_booking" && booking_id) {
    // Fetch booking first so we know seats freed (for waitlist promotion) and who to notify
    const { data: bk } = await supa
      .from("bookings").select("status, seats, member_id").eq("id", booking_id).maybeSingle()
    const { error: ce } = await supa
      .from("bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
    // Promote waitlisted members if a confirmed seat was freed
    if (bk?.status === "confirmed") {
      await promoteWaitlist(event_id)
    }
    if (bk?.member_id) {
      const { data: ev } = await supa.from("events").select("title").eq("id", event_id).single()
      await notify(bk.member_id, event_id, "booking_cancelled", `Your booking for ${ev?.title || "this event"} was cancelled.`)
    }
    return NextResponse.json({ ok: true })
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
