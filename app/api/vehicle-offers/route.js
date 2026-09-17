import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import {
  validateSeatsOffered, vehicleSeatsUsed, validateVehicleSeatRequest,
  validateVehiclePassenger, validateDriverSelfNomination, validateBumpReason,
} from "@/lib/vehicleOffers"

// Personal vehicle offers (migration 109, Iain 2026-09-17). Self-service --
// unlike app/api/coordinator/route.js, this is NOT EC/admin-gated: any
// resident already on the event's attendee list can self-nominate as a
// driver, offer seats, pre-assign specific passengers from the roster, or
// claim an open seat in someone else's car. A driver is always a real
// member (member_id) -- a contact has no app login, so they can never
// self-nominate or self-claim; a driver CAN still pre-assign a contact (or
// a guest) as a passenger, since passengers use the full three-way
// booking_attendees identity shape.

export const dynamic = "force-dynamic"

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin.from("members").select("id, name").eq("auth_id", user.id).single()
  return member
}

// The event's current attendee list, as (memberId|contactId|guestName)
// identities -- the booker of every non-cancelled booking, plus every named
// booking_attendees row. Mirrors lib/takenResidents.js's own two-query
// shape, but returns the FULL roster rather than an exclusion set, since
// "is this identity an attendee at all" is what self-nomination/passenger
// eligibility actually needs (scope §1/§5).
async function fetchAttendeeIdentities(eventId) {
  const [{ data: bookingRows }, { data: attendeeRows }] = await Promise.all([
    supabaseAdmin.from("bookings").select("member_id, contact_id").eq("event_id", eventId).neq("status", "cancelled"),
    supabaseAdmin.from("booking_attendees").select("member_id, contact_id, guest_name").eq("event_id", eventId),
  ])
  const memberIds = new Set(), contactIds = new Set(), guestNames = new Set()
  for (const b of bookingRows || []) {
    if (b.member_id) memberIds.add(b.member_id)
    if (b.contact_id) contactIds.add(b.contact_id)
  }
  for (const a of attendeeRows || []) {
    if (a.member_id) memberIds.add(a.member_id)
    if (a.contact_id) contactIds.add(a.contact_id)
    if (a.guest_name) guestNames.add(a.guest_name.trim().toLowerCase())
  }
  return { memberIds, contactIds, guestNames }
}

// This identity's current bus-riding state for the event (scope §2, hard
// exclusivity, both directions) -- true if their own booking has
// bus_passenger, or they're named on a booking_attendees row with
// is_bus_passenger.
async function isBusRider(eventId, { memberId, contactId }) {
  if (memberId) {
    const { data: ownBooking } = await supabaseAdmin
      .from("bookings").select("bus_passenger").eq("event_id", eventId).eq("member_id", memberId).neq("status", "cancelled").maybeSingle()
    if (ownBooking?.bus_passenger) return true
    const { data: namedRow } = await supabaseAdmin
      .from("booking_attendees").select("is_bus_passenger").eq("event_id", eventId).eq("member_id", memberId).maybeSingle()
    return !!namedRow?.is_bus_passenger
  }
  if (contactId) {
    const { data: ownBooking } = await supabaseAdmin
      .from("bookings").select("bus_passenger").eq("event_id", eventId).eq("contact_id", contactId).neq("status", "cancelled").maybeSingle()
    if (ownBooking?.bus_passenger) return true
    const { data: namedRow } = await supabaseAdmin
      .from("booking_attendees").select("is_bus_passenger").eq("event_id", eventId).eq("contact_id", contactId).maybeSingle()
    return !!namedRow?.is_bus_passenger
  }
  return false
}

function identityKey({ member_id, contact_id, guest_name }) {
  if (member_id) return `m:${member_id}`
  if (contact_id) return `c:${contact_id}`
  if (guest_name) return `g:${guest_name.trim().toLowerCase()}`
  return null
}

// ─── GET /api/vehicle-offers?event_id=… ──────────────────────────────────────
// The "open vehicles" pick-a-car list -- every offer on the event with
// driver identity, remaining seats, and its passengers, plus the caller's
// own eligibility state so the client can gate its own controls the same
// way the server will.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get("event_id")
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 })

  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { data: event } = await supabaseAdmin.from("events").select("id, allow_personal_vehicles, has_bus").eq("id", eventId).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: offers, error: oe } = await supabaseAdmin
    .from("vehicle_offers")
    .select(`
      id, event_id, member_id, contact_id, seats_offered, created_at,
      driver:members!member_id(id, name, display_name, hide_name, username),
      driver_contact:contacts!contact_id(id, name),
      passengers:vehicle_offer_passengers(id, member_id, contact_id, guest_name, nominated_by_driver, created_at,
        passenger_member:members!member_id(id, name, display_name, hide_name, username),
        passenger_contact:contacts!contact_id(id, name))
    `)
    .eq("event_id", eventId)
    .order("created_at")
  if (oe) return NextResponse.json({ error: oe.message }, { status: 500 })

  const { memberIds: attendeeMemberIds, contactIds: attendeeContactIds, guestNames: attendeeGuestNames } = await fetchAttendeeIdentities(eventId)
  const myOffer = (offers || []).find(o => o.member_id === member.id)
  const myPassengerRow = (offers || []).flatMap(o => (o.passengers || []).map(p => ({ ...p, vehicle_offer_id: o.id })))
    .find(p => p.member_id === member.id)
  const myBusRider = await isBusRider(eventId, { memberId: member.id })

  return NextResponse.json({
    allow_personal_vehicles: !!event.allow_personal_vehicles,
    has_bus: !!event.has_bus,
    offers: (offers || []).map(o => ({
      id: o.id,
      seats_offered: o.seats_offered,
      seats_used: vehicleSeatsUsed(o.passengers || []),
      seats_remaining: Math.max(0, o.seats_offered - vehicleSeatsUsed(o.passengers || [])),
      is_own_offer: o.member_id === member.id,
      driver: o.driver ? { member_id: o.driver.id, name: o.driver.name, display_name: o.driver.display_name, hide_name: o.driver.hide_name, username: o.driver.username }
        : o.driver_contact ? { contact_id: o.driver_contact.id, name: o.driver_contact.name } : null,
      passengers: (o.passengers || []).map(p => ({
        id: p.id,
        nominated_by_driver: p.nominated_by_driver,
        is_me: p.member_id === member.id,
        name: p.passenger_member ? (p.passenger_member.display_name || p.passenger_member.name) : p.passenger_contact ? p.passenger_contact.name : p.guest_name,
        guest: !!p.guest_name,
      })),
    })),
    my: {
      is_attendee: attendeeMemberIds.has(member.id),
      is_bus_rider: myBusRider,
      is_driving: !!myOffer,
      my_offer_id: myOffer?.id || null,
      is_passenger_elsewhere: !!myPassengerRow && myPassengerRow.vehicle_offer_id !== myOffer?.id,
      my_passenger_row_id: myPassengerRow?.id || null,
    },
  })
}

// ─── POST /api/vehicle-offers ────────────────────────────────────────────────
export async function POST(req) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const member = await getMember(token)
  if (!member) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const body = await req.json()
  const { event_id, action } = body
  if (!event_id || !action) return NextResponse.json({ error: "event_id and action required" }, { status: 400 })

  const { data: event } = await supabaseAdmin.from("events").select("id, title, allow_personal_vehicles").eq("id", event_id).single()
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
  if (!event.allow_personal_vehicles) return NextResponse.json({ error: "This event doesn't have personal vehicle offers enabled." }, { status: 400 })

  const { memberIds: attendeeMemberIds, contactIds: attendeeContactIds, guestNames: attendeeGuestNames } = await fetchAttendeeIdentities(event_id)

  // ── Self-nominate / update own offer ──────────────────────────────────────
  if (action === "offer") {
    const seatsCheck = validateSeatsOffered(body.seats_offered)
    if (!seatsCheck.ok) return NextResponse.json({ error: seatsCheck.error }, { status: 400 })

    const { data: existingPassengerRow } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, vehicle_offer_id").eq("event_id", event_id).eq("member_id", member.id).maybeSingle()
    const { data: myExistingOffer } = await supabaseAdmin
      .from("vehicle_offers").select("id").eq("event_id", event_id).eq("member_id", member.id).maybeSingle()
    // A passenger seat under the caller's OWN offer (shouldn't exist -- a
    // driver never claims their own car) doesn't count as "elsewhere".
    const alreadyPassengerElsewhere = !!existingPassengerRow && existingPassengerRow.vehicle_offer_id !== myExistingOffer?.id

    const busRider = await isBusRider(event_id, { memberId: member.id })
    const eligibility = validateDriverSelfNomination({
      isAttendee: attendeeMemberIds.has(member.id),
      isBusRider: busRider,
      alreadyPassengerElsewhere,
    })
    if (!eligibility.ok) return NextResponse.json({ error: eligibility.error }, { status: 400 })

    // Not a plain .upsert(): the (event_id, member_id) uniqueness is a
    // PARTIAL index (WHERE member_id IS NOT NULL, since a driver is
    // member_id XOR contact_id) -- PostgREST's upsert onConflict target
    // must match a full unique constraint, not a partial one, so this
    // does the update-else-insert explicitly instead.
    const savedId = myExistingOffer
      ? await supabaseAdmin.from("vehicle_offers").update({ seats_offered: seatsCheck.seats, updated_at: new Date().toISOString() }).eq("id", myExistingOffer.id).select("id").single()
      : await supabaseAdmin.from("vehicle_offers").insert({ event_id, member_id: member.id, seats_offered: seatsCheck.seats }).select("id").single()
    if (savedId.error) return NextResponse.json({ error: savedId.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, vehicle_offer_id: savedId.data.id })
  }

  // ── Withdraw own offer entirely ────────────────────────────────────────────
  if (action === "withdraw_offer") {
    const { data: offer } = await supabaseAdmin.from("vehicle_offers").select("id, member_id").eq("id", body.vehicle_offer_id).eq("event_id", event_id).single()
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.member_id !== member.id) return NextResponse.json({ error: "Not your offer" }, { status: 403 })

    const { data: passengers } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, member_id, guest_name").eq("vehicle_offer_id", offer.id)
    if ((passengers || []).length > 0) {
      const bumpCheck = validateBumpReason(body.reason)
      if (!bumpCheck.ok) return NextResponse.json({ error: bumpCheck.error }, { status: 400 })
      for (const p of passengers) {
        if (p.member_id) {
          await notify(p.member_id, event_id, "vehicle_offer_seat_removed",
            `${member.name} withdrew their car offer for ${event.title}: ${bumpCheck.reason}`, undefined, member.id)
        }
      }
    }
    const { error: de } = await supabaseAdmin.from("vehicle_offers").delete().eq("id", offer.id)
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Driver pre-assigns a specific attendee to their own offer ─────────────
  if (action === "assign_passenger") {
    const { data: offer } = await supabaseAdmin.from("vehicle_offers").select("id, member_id, seats_offered").eq("id", body.vehicle_offer_id).eq("event_id", event_id).single()
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.member_id !== member.id) return NextResponse.json({ error: "Not your offer" }, { status: 403 })

    return await addPassenger({ event, offer, body, nominatedByDriver: true, actingMemberId: member.id, attendeeMemberIds, attendeeContactIds, attendeeGuestNames })
  }

  // ── Attendee self-claims an open seat ──────────────────────────────────────
  if (action === "claim_seat") {
    const { data: offer } = await supabaseAdmin.from("vehicle_offers").select("id, member_id, seats_offered").eq("id", body.vehicle_offer_id).eq("event_id", event_id).single()
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.member_id === member.id) return NextResponse.json({ error: "You can't claim a seat in your own car." }, { status: 400 })

    const result = await addPassenger({
      event, offer, body: { member_id: member.id }, nominatedByDriver: false, actingMemberId: member.id,
      attendeeMemberIds, attendeeContactIds, attendeeGuestNames,
    })
    return result
  }

  // ── Driver bumps an already-seated passenger (reason mandatory) ───────────
  if (action === "remove_passenger") {
    const { data: passenger } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, member_id, guest_name, vehicle_offer_id, vehicle_offers!inner(member_id, event_id)")
      .eq("id", body.vehicle_offer_passenger_id).single()
    if (!passenger) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.event_id !== event_id) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.member_id !== member.id) return NextResponse.json({ error: "Not your car" }, { status: 403 })

    const bumpCheck = validateBumpReason(body.reason)
    if (!bumpCheck.ok) return NextResponse.json({ error: bumpCheck.error }, { status: 400 })

    const { error: de } = await supabaseAdmin.from("vehicle_offer_passengers").delete().eq("id", passenger.id)
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })

    if (passenger.member_id) {
      await notify(passenger.member_id, event_id, "vehicle_offer_seat_removed",
        `${member.name} removed you from their car for ${event.title}: ${bumpCheck.reason}`, undefined, member.id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Passenger leaves their own claimed/assigned seat (no reason needed) ───
  if (action === "leave_seat") {
    const { data: passenger } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, member_id, vehicle_offer_id, vehicle_offers!inner(event_id)")
      .eq("id", body.vehicle_offer_passenger_id).single()
    if (!passenger) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.event_id !== event_id) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.member_id !== member.id) return NextResponse.json({ error: "Not your seat" }, { status: 403 })

    const { error: de } = await supabaseAdmin.from("vehicle_offer_passengers").delete().eq("id", passenger.id)
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// Shared by assign_passenger (driver-nominated) and claim_seat (self-claim).
// candidate identity comes from body: { member_id } or { contact_id } or
// { guest_name } -- exactly one, mirroring booking_attendees' own shape.
async function addPassenger({ event, offer, body, nominatedByDriver, actingMemberId, attendeeMemberIds, attendeeContactIds, attendeeGuestNames }) {
  const candidateMemberId = body.member_id || null
  const candidateContactId = body.contact_id || null
  const candidateGuestName = typeof body.guest_name === "string" ? body.guest_name.trim() : null
  if (!candidateMemberId && !candidateContactId && !candidateGuestName) {
    return NextResponse.json({ error: "A passenger needs a resident or guest name." }, { status: 400 })
  }

  const isAttendee = candidateMemberId ? attendeeMemberIds.has(candidateMemberId)
    : candidateContactId ? attendeeContactIds.has(candidateContactId)
    : attendeeGuestNames.has(candidateGuestName.toLowerCase())

  const { data: currentPassengers } = await supabaseAdmin
    .from("vehicle_offer_passengers").select("id, member_id, contact_id, guest_name").eq("vehicle_offer_id", offer.id)
  const currentUsed = vehicleSeatsUsed(currentPassengers || [])

  const seatCheck = validateVehicleSeatRequest({ requested: 1, seatsOffered: offer.seats_offered, currentUsed })
  if (!seatCheck.ok) return NextResponse.json({ error: seatCheck.error }, { status: 409 })

  const { data: driverElsewhere } = candidateMemberId
    ? await supabaseAdmin.from("vehicle_offers").select("id").eq("event_id", event.id).eq("member_id", candidateMemberId).maybeSingle()
    : { data: null }
  const busRider = await isBusRider(event.id, { memberId: candidateMemberId, contactId: candidateContactId })

  const candidateKey = identityKey({ member_id: candidateMemberId, contact_id: candidateContactId, guest_name: candidateGuestName })
  const alreadyPassengerElsewhere = (currentPassengers || []).length === 0
    ? false
    : (await supabaseAdmin.from("vehicle_offer_passengers").select("id, member_id, contact_id, guest_name").eq("event_id", event.id))
        .data?.some(p => p.vehicle_offer_id !== offer.id && identityKey(p) === candidateKey) || false

  const eligibility = validateVehiclePassenger({
    isAttendee, alreadyDrivingEvent: !!driverElsewhere, isBusRider: busRider, alreadyPassengerElsewhere,
  })
  if (!eligibility.ok) return NextResponse.json({ error: eligibility.error }, { status: 400 })

  // Duplicate-in-this-car guard for member/contact identities -- the DB's
  // own partial-unique indexes (event_id, member_id)/(event_id, contact_id)
  // catch this too, but checking here first gives a real error message
  // instead of a raw constraint violation.
  const dup = (currentPassengers || []).some(p => identityKey(p) === candidateKey)
  if (dup) return NextResponse.json({ error: "Already in this car." }, { status: 400 })

  const { data: saved, error: ie } = await supabaseAdmin
    .from("vehicle_offer_passengers")
    .insert({
      vehicle_offer_id: offer.id, event_id: event.id,
      member_id: candidateMemberId, contact_id: candidateContactId, guest_name: candidateGuestName,
      nominated_by_driver: nominatedByDriver,
    })
    .select("id").single()
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })

  // Courtesy notifications, deliberately not in PUSH_TYPES (see lib/notify.js)
  // -- lower stakes than a bump, in-app only.
  if (nominatedByDriver && candidateMemberId) {
    await notify(candidateMemberId, event.id, "vehicle_offer_seat_assigned",
      `You've been given a seat in ${offer.member_id ? "a" : "a"} car for ${event.title}.`, undefined, actingMemberId)
  } else if (!nominatedByDriver && offer.member_id) {
    await notify(offer.member_id, event.id, "vehicle_offer_seat_claimed",
      `Someone claimed a seat in your car for ${event.title}.`, undefined, actingMemberId)
  }

  return NextResponse.json({ ok: true, id: saved.id })
}
