import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { NextResponse } from "next/server"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import { VEHICLE_OFFER_SELECT } from "@/lib/vehicleSections"
import {
  validateSeatsOffered, vehicleSeatsUsed, validateVehicleSeatRequest,
  validateDriverSelfNomination, validatePartyForVehicle, validateBumpReason,
  buildSeatClaimedMessage, buildSeatAssignedMessage,
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
//
// Migration 110 follow-up (Iain, live-fire review of PR #145, "Whole
// party, same rule everywhere"): a car seat is never claimed or assigned
// per-person. Whichever side initiates it -- a driver pre-assigning one
// named attendee, or an attendee self-claiming -- pulls that person's
// WHOLE booking party into the same car, atomically, or not at all if the
// car doesn't have room for the whole party. resolveBookingParty() below
// is what finds "the whole party" for any identity; addPartyToOffer() is
// the one place that actually seats a party into a car, used by both
// assign_passenger and claim_seat so they can't drift apart.

export const dynamic = "force-dynamic"

async function getMember(token) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: member } = await supabaseAdmin.from("members").select("id, name, display_name, hide_name").eq("auth_id", user.id).single()
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
// is_bus_passenger. Extended (migration 110 follow-up) to also accept
// guestName: guests can ride the bus too via booking_attendees'
// is_bus_passenger, and a party can include a guest, so this needed to
// stop being member/contact-only.
async function isBusRider(eventId, { memberId, contactId, guestName } = {}) {
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
  if (guestName) {
    const { data: namedRow } = await supabaseAdmin
      .from("booking_attendees").select("is_bus_passenger").eq("event_id", eventId).ilike("guest_name", guestName.trim()).maybeSingle()
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

function displayName(personRow) {
  if (!personRow) return null
  if (personRow.member) return personRow.member.hide_name ? "Resident" : (personRow.member.display_name || personRow.member.name)
  if (personRow.contact) return personRow.contact.name
  return null
}

// Finds "the whole booking party" for any identity -- the booker (owner)
// plus every booking_attendees row owned by that booker for this event.
// identity is exactly one of { memberId }, { contactId }, { guestName }.
// Works whichever side initiates a car assignment: identity can be the
// booker themselves, or any named party member (a driver pre-assigning a
// spouse resolves to the SAME party as the booker self-claiming would).
// Returns null if identity isn't part of any booking for this event at all.
async function resolveBookingParty(eventId, identity) {
  let ownerMemberId = null, ownerContactId = null

  // 1. Is this identity itself a booker?
  if (identity.memberId) {
    const { data: ownBooking } = await supabaseAdmin
      .from("bookings").select("member_id, contact_id").eq("event_id", eventId).eq("member_id", identity.memberId).neq("status", "cancelled").maybeSingle()
    if (ownBooking) { ownerMemberId = ownBooking.member_id; ownerContactId = ownBooking.contact_id }
  } else if (identity.contactId) {
    const { data: ownBooking } = await supabaseAdmin
      .from("bookings").select("member_id, contact_id").eq("event_id", eventId).eq("contact_id", identity.contactId).neq("status", "cancelled").maybeSingle()
    if (ownBooking) { ownerMemberId = ownBooking.member_id; ownerContactId = ownBooking.contact_id }
  }

  // 2. Else, is this identity a named party member under someone else's booking?
  if (!ownerMemberId && !ownerContactId) {
    let q = supabaseAdmin.from("booking_attendees").select("owner_id, owner_contact_id").eq("event_id", eventId)
    if (identity.memberId) q = q.eq("member_id", identity.memberId)
    else if (identity.contactId) q = q.eq("contact_id", identity.contactId)
    else if (identity.guestName) q = q.ilike("guest_name", identity.guestName.trim())
    else return null
    const { data: row } = await q.maybeSingle()
    if (row) { ownerMemberId = row.owner_id; ownerContactId = row.owner_contact_id }
  }

  if (!ownerMemberId && !ownerContactId) return null

  // 3. Fetch the FULL party: the owner's own seat (their booking) plus
  // every booking_attendees row owned by them for this event.
  const [{ data: ownerBookingRow }, { data: attendeeRows }] = await Promise.all([
    supabaseAdmin.from("bookings").select(`
      member_id, contact_id,
      member:members!member_id(id, name, display_name, hide_name),
      contact:contacts!contact_id(id, name)
    `).eq("event_id", eventId)
      .eq(ownerMemberId ? "member_id" : "contact_id", ownerMemberId || ownerContactId)
      .neq("status", "cancelled").maybeSingle(),
    supabaseAdmin.from("booking_attendees").select(`
      id, member_id, contact_id, guest_name,
      member:members!member_id(id, name, display_name, hide_name),
      contact:contacts!contact_id(id, name)
    `).eq("event_id", eventId)
      .eq(ownerMemberId ? "owner_id" : "owner_contact_id", ownerMemberId || ownerContactId),
  ])

  const members = []
  if (ownerBookingRow) {
    members.push({
      member_id: ownerBookingRow.member_id, contact_id: ownerBookingRow.contact_id, guest_name: null,
      name: displayName(ownerBookingRow) || "Resident",
    })
  }
  for (const a of attendeeRows || []) {
    members.push({
      member_id: a.member_id, contact_id: a.contact_id, guest_name: a.guest_name,
      name: displayName(a) || a.guest_name || "Guest",
    })
  }
  return { ownerMemberId, ownerContactId, members }
}

// ─── GET /api/vehicle-offers?event_id=… ──────────────────────────────────────
// The "open vehicles" pick-a-car list -- every offer on the event with
// driver identity, remaining seats, and its passengers (grouped by booking
// party so the UI can show "riding together"), plus the caller's own
// eligibility state so the client can gate its own controls the same way
// the server will.
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
        party_owner_member_id, party_owner_contact_id,
        passenger_member:members!member_id(id, name, display_name, hide_name, username),
        passenger_contact:contacts!contact_id(id, name))
    `)
    .eq("event_id", eventId)
    .order("created_at")
  if (oe) return NextResponse.json({ error: oe.message }, { status: 500 })

  const { memberIds: attendeeMemberIds } = await fetchAttendeeIdentities(eventId)
  const myOffer = (offers || []).find(o => o.member_id === member.id)
  const myPassengerRow = (offers || []).flatMap(o => (o.passengers || []).map(p => ({ ...p, vehicle_offer_id: o.id })))
    .find(p => p.member_id === member.id)
  const myBusRider = await isBusRider(eventId, { memberId: member.id })

  return NextResponse.json({
    allow_personal_vehicles: !!event.allow_personal_vehicles,
    has_bus: !!event.has_bus,
    offers: (offers || []).map(o => {
      const partyKey = p => (p.party_owner_member_id ? `m:${p.party_owner_member_id}` : p.party_owner_contact_id ? `c:${p.party_owner_contact_id}` : `p:${p.id}`)
      return {
        id: o.id,
        seats_offered: o.seats_offered,
        seats_used: vehicleSeatsUsed(o.passengers || []),
        seats_remaining: Math.max(0, o.seats_offered - vehicleSeatsUsed(o.passengers || [])),
        is_own_offer: o.member_id === member.id,
        driver: o.driver ? { member_id: o.driver.id, name: o.driver.name, display_name: o.driver.display_name, hide_name: o.driver.hide_name, username: o.driver.username }
          : o.driver_contact ? { contact_id: o.driver_contact.id, name: o.driver_contact.name } : null,
        passengers: (o.passengers || []).map(p => ({
          id: p.id,
          party_key: partyKey(p),
          nominated_by_driver: p.nominated_by_driver,
          is_me: p.member_id === member.id,
          name: p.passenger_member ? (p.passenger_member.display_name || p.passenger_member.name) : p.passenger_contact ? p.passenger_contact.name : p.guest_name,
          guest: !!p.guest_name,
        })),
      }
    }),
    my: {
      is_attendee: attendeeMemberIds.has(member.id),
      is_bus_rider: myBusRider,
      is_driving: !!myOffer,
      my_offer_id: myOffer?.id || null,
      is_passenger_elsewhere: !!myPassengerRow && myPassengerRow.vehicle_offer_id !== myOffer?.id,
      my_passenger_row_id: myPassengerRow?.id || null,
      my_party_key: myPassengerRow ? (myPassengerRow.party_owner_member_id ? `m:${myPassengerRow.party_owner_member_id}` : myPassengerRow.party_owner_contact_id ? `c:${myPassengerRow.party_owner_contact_id}` : `p:${myPassengerRow.id}`) : null,
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

  const { memberIds: attendeeMemberIds } = await fetchAttendeeIdentities(event_id)

  // ── Self-nominate / update own offer ──────────────────────────────────────
  // Unaffected by the party-grouping change -- becoming a driver is a
  // decision about the caller themselves, not their booking party.
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
          const driverName = resolveMemberName(member, { viewerId: p.member_id, fallback: "The driver" })
          await notify(p.member_id, event_id, "vehicle_offer_seat_removed",
            `${driverName} withdrew their car offer for ${event.title}: ${bumpCheck.reason}`, undefined, member.id)
        }
      }
    }
    const { error: de } = await supabaseAdmin.from("vehicle_offers").delete().eq("id", offer.id)
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Driver pre-assigns a specific attendee's WHOLE PARTY to their own offer ─
  if (action === "assign_passenger") {
    const { data: offer } = await supabaseAdmin.from("vehicle_offers").select(VEHICLE_OFFER_SELECT).eq("id", body.vehicle_offer_id).eq("event_id", event_id).single()
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.member_id !== member.id) return NextResponse.json({ error: "Not your offer" }, { status: 403 })

    const identity = { memberId: body.member_id || null, contactId: body.contact_id || null, guestName: body.guest_name || null }
    if (!identity.memberId && !identity.contactId && !identity.guestName) {
      return NextResponse.json({ error: "A passenger needs a resident or guest name." }, { status: 400 })
    }
    return await addPartyToOffer({ event, offer, identity, nominatedByDriver: true, actingMemberId: member.id, actingMember: member })
  }

  // ── Attendee self-claims an open seat -- brings their WHOLE PARTY ─────────
  if (action === "claim_seat") {
    const { data: offer } = await supabaseAdmin.from("vehicle_offers").select(VEHICLE_OFFER_SELECT).eq("id", body.vehicle_offer_id).eq("event_id", event_id).single()
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    if (offer.member_id === member.id) return NextResponse.json({ error: "You can't claim a seat in your own car." }, { status: 400 })

    return await addPartyToOffer({ event, offer, identity: { memberId: member.id }, nominatedByDriver: false, actingMemberId: member.id, actingMember: member })
  }

  // ── Driver bumps an already-seated passenger's WHOLE PARTY (reason mandatory) ─
  if (action === "remove_passenger") {
    const { data: passenger } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, member_id, guest_name, vehicle_offer_id, party_owner_member_id, party_owner_contact_id, vehicle_offers!inner(member_id, event_id)")
      .eq("id", body.vehicle_offer_passenger_id).single()
    if (!passenger) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.event_id !== event_id) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.member_id !== member.id) return NextResponse.json({ error: "Not your car" }, { status: 403 })

    const bumpCheck = validateBumpReason(body.reason)
    if (!bumpCheck.ok) return NextResponse.json({ error: bumpCheck.error }, { status: 400 })

    const partyRows = await partyRowsInOffer(passenger)
    const { error: de } = await supabaseAdmin.from("vehicle_offer_passengers").delete().in("id", partyRows.map(p => p.id))
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })

    for (const p of partyRows) {
      if (p.member_id) {
        const driverName = resolveMemberName(member, { viewerId: p.member_id, fallback: "The driver" })
        await notify(p.member_id, event_id, "vehicle_offer_seat_removed",
          `${driverName} removed your booking party from their car for ${event.title}: ${bumpCheck.reason}`, undefined, member.id)
      }
    }
    return NextResponse.json({ ok: true, removed: partyRows.length })
  }

  // ── A member of the party leaves their WHOLE PARTY's claimed/assigned seat ─
  // (no reason needed -- this is a self-withdrawal, not a bump).
  if (action === "leave_seat") {
    const { data: passenger } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("id, member_id, party_owner_member_id, party_owner_contact_id, vehicle_offer_id, vehicle_offers!inner(event_id)")
      .eq("id", body.vehicle_offer_passenger_id).single()
    if (!passenger) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.vehicle_offers.event_id !== event_id) return NextResponse.json({ error: "Passenger not found" }, { status: 404 })
    if (passenger.member_id !== member.id) return NextResponse.json({ error: "Not your seat" }, { status: 403 })

    const partyRows = await partyRowsInOffer(passenger)
    const { error: de } = await supabaseAdmin.from("vehicle_offer_passengers").delete().in("id", partyRows.map(p => p.id))
    if (de) return NextResponse.json({ error: de.message }, { status: 500 })
    return NextResponse.json({ ok: true, removed: partyRows.length })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

// Every vehicle_offer_passengers row that belongs to the SAME booking party
// as `passenger`, within the SAME car (vehicle_offer_id) -- the set a bump
// or a self-leave must act on together. Rows written before migration 110
// (or a row whose party owner somehow wasn't stamped) have no
// party_owner_*; treated as a party of one, i.e. just that row, rather than
// erroring or over-matching every party-less row in the car.
async function partyRowsInOffer(passenger) {
  if (!passenger.party_owner_member_id && !passenger.party_owner_contact_id) {
    return [{ id: passenger.id, member_id: passenger.member_id }]
  }
  const col = passenger.party_owner_member_id ? "party_owner_member_id" : "party_owner_contact_id"
  const val = passenger.party_owner_member_id || passenger.party_owner_contact_id
  const { data: rows } = await supabaseAdmin
    .from("vehicle_offer_passengers").select("id, member_id")
    .eq("vehicle_offer_id", passenger.vehicle_offer_id).eq(col, val)
  return rows && rows.length > 0 ? rows : [{ id: passenger.id, member_id: passenger.member_id }]
}

// The one place a party actually gets seated in a car -- used by both
// assign_passenger (driver-initiated) and claim_seat (self-claim) so the
// "whole party moves together, same rule everywhere" behaviour can't drift
// between the two entry points (Iain's confirmed answer, live-fire review
// of PR #145).
async function addPartyToOffer({ event, offer, identity, nominatedByDriver, actingMemberId, actingMember }) {
  const party = await resolveBookingParty(event.id, identity)
  if (!party || party.members.length === 0) {
    return NextResponse.json({ error: "Couldn't find that person's booking for this event." }, { status: 400 })
  }

  const { data: currentPassengers } = await supabaseAdmin
    .from("vehicle_offer_passengers").select("id, member_id, contact_id, guest_name").eq("vehicle_offer_id", offer.id)
  const currentKeys = new Set((currentPassengers || []).map(p => identityKey(p)))

  // Party members already seated in THIS exact car don't need re-adding --
  // this makes a re-click/retry idempotent instead of erroring.
  const newMembers = party.members.filter(m => !currentKeys.has(identityKey(m)))
  if (newMembers.length === 0) {
    return NextResponse.json({ error: "Your whole booking party is already in this car." }, { status: 400 })
  }

  // Per-member eligibility lookups, in parallel, for just the new members.
  const enriched = await Promise.all(newMembers.map(async m => {
    const alreadyDrivingEvent = m.member_id
      ? !!(await supabaseAdmin.from("vehicle_offers").select("id").eq("event_id", event.id).eq("member_id", m.member_id).maybeSingle()).data
      : false // only members (residents with a login) can ever be drivers
    const busRider = await isBusRider(event.id, { memberId: m.member_id, contactId: m.contact_id, guestName: m.guest_name })
    const key = identityKey(m)
    const { data: otherOfferRows } = await supabaseAdmin
      .from("vehicle_offer_passengers").select("vehicle_offer_id, member_id, contact_id, guest_name").eq("event_id", event.id)
    const alreadyPassengerElsewhere = (otherOfferRows || []).some(p => p.vehicle_offer_id !== offer.id && identityKey(p) === key)
    return { ...m, alreadyDrivingEvent, isBusRider: busRider, alreadyPassengerElsewhere }
  }))

  const partyCheck = validatePartyForVehicle({
    partyMembers: enriched,
    seatsOffered: offer.seats_offered,
    currentUsed: vehicleSeatsUsed(currentPassengers || []),
  })
  if (!partyCheck.ok) return NextResponse.json({ error: partyCheck.error }, { status: 409 })

  const rowsToInsert = newMembers.map(m => ({
    vehicle_offer_id: offer.id, event_id: event.id,
    member_id: m.member_id || null, contact_id: m.contact_id || null, guest_name: m.guest_name || null,
    nominated_by_driver: nominatedByDriver,
    party_owner_member_id: party.ownerMemberId || null,
    party_owner_contact_id: party.ownerContactId || null,
  }))

  const { data: saved, error: ie } = await supabaseAdmin
    .from("vehicle_offer_passengers").insert(rowsToInsert).select("id")
  if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })

  // Courtesy notifications, deliberately not in PUSH_TYPES (see lib/notify.js)
  // -- lower stakes than a bump, in-app only. One per newly-seated member
  // with a login (contacts/guests have no app to notify).
  //
  // Named with the actual (privacy-masked) display name rather than a
  // generic "Someone"/"A booking party" placeholder (Iain, 2026-09-17,
  // caught from a real notification screenshot -- the data was always
  // there, the wording just never used it). resolveMemberName still
  // respects hide_name exactly as everywhere else in the app: a resident
  // who's set their name private falls back to "The driver"/"A resident"
  // for this recipient, same as they'd render "Resident" anywhere else.
  if (nominatedByDriver) {
    const driverName = resolveMemberName(offer.driver, { fallback: null })
    for (const m of newMembers) {
      if (m.member_id) {
        await notify(m.member_id, event.id, "vehicle_offer_seat_assigned",
          buildSeatAssignedMessage({ driverName, eventTitle: event.title }), undefined, actingMemberId)
      }
    }
  } else if (offer.member_id) {
    const claimantName = resolveMemberName(actingMember, { viewerId: offer.member_id, fallback: null })
    await notify(offer.member_id, event.id, "vehicle_offer_seat_claimed",
      buildSeatClaimedMessage({ claimantName, seatCount: newMembers.length, eventTitle: event.title }), undefined, actingMemberId)
  }

  return NextResponse.json({ ok: true, ids: (saved || []).map(r => r.id), party_size: newMembers.length })
}
