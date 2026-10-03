// Server-side half of coordinator transport allocation -- see
// lib/transportAllocation.js for the rules and Iain's decisions. Used by
// app/api/coordinator/route.js for both add_booking (walk-up) and the
// set_transport action. Service-role only; callers have already checked the
// caller can manage the event (requireEventManage).
//
// Order matters: everything is VALIDATED first, then the party's current
// transport is cleared, then the new one is applied -- so a rejected request
// (bus full, car full) never leaves someone with no transport at all.

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { busSeatsUsed } from "@/lib/busSeats"
import { resolveMemberName } from "@/lib/memberName"
import { validateTransportPlan, buildTransportMessage } from "@/lib/transportAllocation"

function keyOf({ member_id, contact_id, guest_name }) {
  if (member_id) return `m:${member_id}`
  if (contact_id) return `c:${contact_id}`
  if (guest_name) return `g:${guest_name.trim().toLowerCase()}`
  return null
}

function driverNameOf(offer) {
  if (!offer) return null
  if (offer.driver) return resolveMemberName(offer.driver, { fallback: "a resident" })
  if (offer.driver_contact) return offer.driver_contact.name || "a resident"
  return null
}

// owner: { memberId } or { contactId } -- the booking owner.
// mode: "none" | "bus" | "car" | "driver"
// vehicleOfferId: for mode "car"
// seatsOffered: for mode "driver"
// actingMemberId: the coordinator (excluded from their own notifications)
// skipOwnerNotify: true on walk-up, where the owner already gets a
//   "you were added" notification that mentions the transport.
// validateOnly + preview: add_booking checks the plan BEFORE inserting the
//   booking, so a full bus/car rejects the walk-up instead of half-saving it.
export async function applyTransport({ eventId, owner, mode, vehicleOfferId = null, seatsOffered, actingMemberId = null, validateOnly = false, preview = null, skipOwnerNotify = false }) {
  const ownerMemberId = owner.memberId || null
  const ownerContactId = owner.contactId || null
  if (!ownerMemberId && !ownerContactId) return { ok: false, status: 400, error: "member_id or contact_id required" }

  const { data: event } = await supa.from("events")
    .select("id, title, has_bus, bus_max_seats, allow_personal_vehicles").eq("id", eventId).single()
  if (!event) return { ok: false, status: 404, error: "Event not found" }

  // ── Party: the owner's confirmed booking + every named attendee they own ──
  // `preview` lets add_booking validate BEFORE the booking row exists:
  // { confirmed, seats, attendees: [{member_id,contact_id,guest_name}] }.
  let booking = null, attendees = []
  if (preview) {
    booking = preview.confirmed ? { id: null, seats: preview.seats, bus_passenger: false } : null
    attendees = preview.attendees || []
  } else {
    let bq = supa.from("bookings").select("id, seats, bus_passenger").eq("event_id", eventId).eq("status", "confirmed")
    bq = ownerMemberId ? bq.eq("member_id", ownerMemberId) : bq.eq("contact_id", ownerContactId)
    const { data: b } = await bq.maybeSingle()
    booking = b || null
    let aq = supa.from("booking_attendees").select("id, member_id, contact_id, guest_name, is_bus_passenger").eq("event_id", eventId)
    aq = ownerMemberId ? aq.eq("owner_id", ownerMemberId) : aq.eq("owner_contact_id", ownerContactId)
    const { data: a } = await aq
    attendees = a || []
  }
  const ownerIdentity = { member_id: ownerMemberId, contact_id: ownerContactId, guest_name: null }
  const party = [ownerIdentity, ...attendees.map(a => ({ member_id: a.member_id || null, contact_id: a.contact_id || null, guest_name: a.guest_name || null }))]
  const partyKeys = new Set(party.map(keyOf).filter(Boolean))
  const ownerKey = keyOf(ownerIdentity)

  // ── Current bus usage outside this party ──────────────────────────────────
  const [{ data: busBookings }, { data: busAttendees }] = await Promise.all([
    supa.from("bookings").select("id, status, bus_passenger, member_id, contact_id").eq("event_id", eventId).eq("status", "confirmed"),
    supa.from("booking_attendees").select("is_bus_passenger, owner_id, owner_contact_id").eq("event_id", eventId),
  ])
  const isOwnerRow = r => (ownerMemberId ? r.member_id === ownerMemberId : r.contact_id === ownerContactId)
  const isOwnedByOwner = r => (ownerMemberId ? r.owner_id === ownerMemberId : r.owner_contact_id === ownerContactId)
  const busOthersUsed = busSeatsUsed({
    bookings: (busBookings || []).filter(b => !isOwnerRow(b)),
    attendees: (busAttendees || []).filter(a => !isOwnedByOwner(a)),
  })

  // ── Cars on this event ────────────────────────────────────────────────────
  const { data: offers } = await supa.from("vehicle_offers")
    .select(`id, member_id, contact_id, seats_offered,
      driver:members!member_id(id, name, display_name, hide_name, username),
      driver_contact:contacts!contact_id(id, name),
      passengers:vehicle_offer_passengers(id, member_id, contact_id, guest_name)`)
    .eq("event_id", eventId)
  const allOffers = offers || []
  const offerDriverKey = o => (o.member_id ? `m:${o.member_id}` : o.contact_id ? `c:${o.contact_id}` : null)

  const chosen = mode === "car" ? allOffers.find(o => o.id === vehicleOfferId) || null : null
  const ownOffer = allOffers.find(o => offerDriverKey(o) === ownerKey) || null
  const othersIn = o => (o?.passengers || []).filter(p => !partyKeys.has(keyOf(p)))

  const check = validateTransportPlan({
    mode, event,
    bookingConfirmed: !!booking,
    bookingSeats: booking?.seats || 1,
    partySize: party.length,
    busOthersUsed,
    offer: chosen,
    carUsedByOthers: othersIn(chosen).length,
    offerOwnedByParty: chosen ? partyKeys.has(offerDriverKey(chosen)) : false,
    driverSeats: seatsOffered,
    othersInOwnCar: mode === "driver" ? othersIn(ownOffer).length : 0,
  })
  if (!check.ok) return { ok: false, status: 409, error: check.error }
  if (validateOnly) return { ok: true }

  const partyDrivesSomething = allOffers.some(o => partyKeys.has(offerDriverKey(o)))
  const hadTransport = !!booking?.bus_passenger || attendees.some(a => a.is_bus_passenger)
    || allOffers.some(o => (o.passengers || []).some(p => partyKeys.has(keyOf(p)))) || partyDrivesSomething
  if (mode === "none" && !hadTransport) return { ok: true, unchanged: true }

  // ── Clear the party's current transport ───────────────────────────────────
  // Bus flags off for the whole party.
  if (booking?.id && booking.bus_passenger) {
    await supa.from("bookings").update({ bus_passenger: false }).eq("id", booking.id)
  }
  {
    let q = supa.from("booking_attendees").update({ is_bus_passenger: false }).eq("event_id", eventId)
    q = ownerMemberId ? q.eq("owner_id", ownerMemberId) : q.eq("owner_contact_id", ownerContactId)
    await q
  }

  // Passenger seats anywhere on the event. Tell any driver who lost them.
  const freedByOffer = new Map()
  const passengerIdsToDelete = []
  for (const o of allOffers) {
    for (const p of o.passengers || []) {
      if (partyKeys.has(keyOf(p))) {
        // Keep the party's seats in the owner's own car when they stay the driver.
        if (mode === "driver" && ownOffer && o.id === ownOffer.id) continue
        passengerIdsToDelete.push(p.id)
        // Tell the car's driver -- unless they're in this booking too (their
        // own car is handled below) or the party is just staying put.
        if (!(mode === "car" && o.id === vehicleOfferId) && !partyKeys.has(offerDriverKey(o))) {
          freedByOffer.set(o.id, (freedByOffer.get(o.id) || 0) + 1)
        }
      }
    }
  }
  if (passengerIdsToDelete.length) await supa.from("vehicle_offer_passengers").delete().in("id", passengerIdsToDelete)
  const ownerName = await partyOwnerName(ownerMemberId, ownerContactId)
  for (const [offerId] of freedByOffer) {
    const o = allOffers.find(x => x.id === offerId)
    if (o?.member_id && o.member_id !== actingMemberId) {
      await notify(o.member_id, eventId, "vehicle_offer_seat_removed",
        `The Event Coordinator moved ${ownerName}'s booking out of your car for ${event.title}.`, undefined, actingMemberId)
    }
  }

  // Any car driven by someone in this party, other than the owner's own car
  // when they're staying a driver, is withdrawn. Its other passengers are told.
  for (const o of allOffers) {
    if (!partyKeys.has(offerDriverKey(o))) continue
    if (mode === "driver" && ownOffer && o.id === ownOffer.id) continue
    for (const p of othersIn(o)) {
      if (p.member_id && p.member_id !== actingMemberId) {
        await notify(p.member_id, eventId, "vehicle_offer_seat_removed",
          `${driverNameOf(o) || "Your driver"} is no longer driving to ${event.title}, so you've been taken out of their car. Please choose another way to get there.`,
          undefined, actingMemberId)
      }
    }
    await supa.from("vehicle_offers").delete().eq("id", o.id)
  }

  // ── Apply the new transport ───────────────────────────────────────────────
  let driverName = null
  if (mode === "bus") {
    if (booking?.id) await supa.from("bookings").update({ bus_passenger: true }).eq("id", booking.id)
    let q = supa.from("booking_attendees").update({ is_bus_passenger: true }).eq("event_id", eventId)
    q = ownerMemberId ? q.eq("owner_id", ownerMemberId) : q.eq("owner_contact_id", ownerContactId)
    await q
  }

  const seatParty = async (offerId, members) => {
    if (!members.length) return { error: null }
    const rows = members.map(m => ({
      vehicle_offer_id: offerId, event_id: eventId,
      member_id: m.member_id, contact_id: m.contact_id, guest_name: m.guest_name,
      nominated_by_driver: true,
      party_owner_member_id: ownerMemberId, party_owner_contact_id: ownerContactId,
    }))
    return supa.from("vehicle_offer_passengers").insert(rows)
  }

  if (mode === "car") {
    const { error } = await seatParty(chosen.id, party)
    if (error) return { ok: false, status: 500, error: error.message }
    driverName = driverNameOf(chosen)
    if (chosen.member_id && chosen.member_id !== actingMemberId) {
      await notify(chosen.member_id, eventId, "vehicle_offer_seat_claimed",
        `The Event Coordinator has put ${ownerName}'s booking (${party.length} ${party.length === 1 ? "person" : "people"}) in your car for ${event.title}.`,
        undefined, actingMemberId)
    }
  }

  if (mode === "driver") {
    let offerId = ownOffer?.id
    if (ownOffer) {
      const { error } = await supa.from("vehicle_offers").update({ seats_offered: check.seats, updated_at: new Date().toISOString() }).eq("id", ownOffer.id)
      if (error) return { ok: false, status: 500, error: error.message }
    } else {
      const { data: created, error } = await supa.from("vehicle_offers")
        .insert({ event_id: eventId, member_id: ownerMemberId, contact_id: ownerContactId, seats_offered: check.seats })
        .select("id").single()
      if (error) return { ok: false, status: 500, error: error.message }
      offerId = created.id
    }
    // The rest of the driver's own booking rides with them. Skip anyone
    // already kept in this car above.
    const alreadyIn = new Set((ownOffer?.passengers || []).map(keyOf))
    const riders = party.filter(m => keyOf(m) !== ownerKey && !alreadyIn.has(keyOf(m)))
    const { error } = await seatParty(offerId, riders)
    if (error) return { ok: false, status: 500, error: error.message }
    driverName = ownerName
  }

  // ── Tell the party (members with an app login only) ───────────────────────
  for (const m of party) {
    if (!m.member_id || m.member_id === actingMemberId) continue
    if (skipOwnerNotify && keyOf(m) === ownerKey) continue
    await notify(m.member_id, eventId, "booking_updated",
      buildTransportMessage({ mode, eventTitle: event.title, driverName, isDriverSelf: mode === "driver" && keyOf(m) === ownerKey }),
      undefined, actingMemberId)
  }

  return { ok: true }
}

async function partyOwnerName(memberId, contactId) {
  if (memberId) {
    const { data } = await supa.from("members").select("name, display_name, hide_name, username").eq("id", memberId).maybeSingle()
    return resolveMemberName(data, { fallback: "a resident" })
  }
  const { data } = await supa.from("contacts").select("name").eq("id", contactId).maybeSingle()
  return data?.name || "a resident"
}
