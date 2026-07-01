import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
    .select("id, seats, status, payment_status, booked_at, members(id, name, username, hide_name)")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .order("booked_at")

  if (be) return NextResponse.json({ error: be.message }, { status: 500 })

  // Also fetch cancelled bookings that have payment info (refund pending or issued)
  const { data: cancelledPayments } = await supa
    .from("bookings")
    .select("id, seats, status, payment_status, booked_at, members(id, name, username, hide_name)")
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .in("payment_status", ["confirmed", "refunded"])
    .order("booked_at")

  const bookings = activeBookings || []
  const refundPending  = (cancelledPayments || []).filter(b => b.payment_status === "confirmed")
  const refundIssued   = (cancelledPayments || []).filter(b => b.payment_status === "refunded")

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

// Promote waitlisted members when confirmed seats become available
async function promoteWaitlist(event_id, freedSeats) {
  const { data: event } = await supa.from("events").select("max_seats").eq("id", event_id).single()
  const { data: confirmedRows } = await supa
    .from("bookings").select("seats").eq("event_id", event_id).eq("status", "confirmed")
  let available = (event?.max_seats || 0) -
    (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  const { data: waitlisted } = await supa
    .from("bookings").select("id, seats")
    .eq("event_id", event_id).eq("status", "waitlist").order("booked_at")
  for (const waiter of (waitlisted || [])) {
    if (available <= 0) break
    if ((waiter.seats || 1) <= available) {
      await supa.from("bookings").update({ status: "confirmed" }).eq("id", waiter.id)
      available -= (waiter.seats || 1)
    }
  }
}

// ─── PATCH /api/coordinator ───────────────────────────────────────────────────
// Multi-purpose: update payment, refund, EC notes, event description/welcome, cancel booking
export async function PATCH(req) {
  const body = await req.json()
  const {
    event_id, action, booking_id, payment_status, refunded,
    coordinator_notes, description, welcome_message,
    has_dining, menu_type, menu_text, image_focal_x, image_focal_y,
  } = body

  if (!event_id) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const { error, status, member } = await resolveEC(req, event_id)
  if (error) return NextResponse.json({ error }, { status })

  // ── Toggle payment status on a booking ──────────────────────────────────────
  if (action === "set_payment" && booking_id) {
    if (!["not_required", "pending", "confirmed", "refunded"].includes(payment_status)) {
      return NextResponse.json({ error: "Invalid payment_status" }, { status: 400 })
    }
    const { error: pe } = await supa
      .from("bookings")
      .update({ payment_status })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Mark refund given on a cancelled booking ─────────────────────────────────
  if (action === "set_refund" && booking_id) {
    const { error: re } = await supa
      .from("bookings")
      .update({ payment_status: refunded ? "refunded" : "pending" })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (re) return NextResponse.json({ error: re.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Cancel a booking on behalf of a user ──────────────────────────────────
  if (action === "cancel_booking" && booking_id) {
    // Fetch booking first so we know seats freed (for waitlist promotion)
    const { data: bk } = await supa
      .from("bookings").select("status, seats").eq("id", booking_id).maybeSingle()
    const { error: ce } = await supa
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking_id)
      .eq("event_id", event_id)
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 })
    // Promote waitlisted members if a confirmed seat was freed
    if (bk?.status === "confirmed") {
      await promoteWaitlist(event_id, bk.seats || 1)
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
