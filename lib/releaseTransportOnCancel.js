// Releases car arrangements for people who are no longer going to an event
// (BUG-102, 2026-10-28). The rules live in lib/vehicleOffers.js's
// planCancelTransportRelease (pure, tested); this file does the reads,
// writes and notifications.
//
//  - A car driven by someone who's leaving is withdrawn; everyone else
//    riding in it is told the driver isn't going and to choose another way.
//  - Seats held in other people's cars by people who are leaving are freed;
//    those drivers are told the seats are free again.
//  - Anyone still going some other way (their own booking, or named on
//    another booking) keeps their car and their seat.
//
// Two entry points:
//  - releaseTransportOnCancel: a whole booking was cancelled. Call it AFTER
//    the booking row is marked cancelled and BEFORE the party's
//    booking_attendees rows are deleted (it reads the party from there).
//    Used by self-cancel (/api/bookings DELETE) and EC cancel
//    (/api/coordinator cancel_booking).
//  - releaseRemovedAttendees: some named people came off a booking (seats
//    reduced / party edited). Called by lib/syncAttendees.js after it has
//    written the new party.
// Best-effort: a failure is logged, never blocks the booking change itself.

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import {
  identityKeyOf, planCancelTransportRelease,
  buildDriverCancelledMessage, buildPassengerCancelledMessage,
} from "@/lib/vehicleOffers"

const isOwnerRow = (row, ownerMemberId, ownerContactId) =>
  ownerMemberId ? row.owner_id === ownerMemberId : row.owner_contact_id === ownerContactId

// Keys still attending the event: every non-cancelled booker, plus everyone
// named on a booking OTHER than this owner's. The owner's own named party is
// left out on purpose -- callers decide who in it is still going.
async function stillGoingOutsideParty(eventId, ownerMemberId, ownerContactId) {
  const [{ data: b }, { data: a }] = await Promise.all([
    supa.from("bookings").select("member_id, contact_id").eq("event_id", eventId).neq("status", "cancelled"),
    supa.from("booking_attendees").select("member_id, contact_id, owner_id, owner_contact_id").eq("event_id", eventId),
  ])
  const keys = new Set((b || []).map(identityKeyOf).filter(Boolean))
  for (const r of a || []) {
    if (!isOwnerRow(r, ownerMemberId, ownerContactId)) {
      const k = identityKeyOf(r)
      if (k) keys.add(k)
    }
  }
  return keys
}

async function runRelease({ eventId, ownerMemberId, ownerContactId, partyKeys, removedGuestNames, stillGoingKeys, actingMemberId, reduced }) {
  const ownerKey = identityKeyOf({ member_id: ownerMemberId, contact_id: ownerContactId })
  const [{ data: offers }, { data: event }] = await Promise.all([
    supa.from("vehicle_offers").select(`id, member_id, contact_id,
      driver:members!member_id(id, name, display_name, hide_name, username),
      driver_contact:contacts!contact_id(id, name),
      passengers:vehicle_offer_passengers(id, member_id, contact_id, guest_name, party_owner_member_id, party_owner_contact_id)`)
      .eq("event_id", eventId),
    supa.from("events").select("title").eq("id", eventId).maybeSingle(),
  ])
  if (!offers?.length) return

  const plan = planCancelTransportRelease({ offers, partyKeys, ownerKey, removedGuestNames, stillGoingKeys })
  const title = event?.title || "this event"

  if (plan.passengerIdsToDelete.length) {
    await supa.from("vehicle_offer_passengers").delete().in("id", plan.passengerIdsToDelete)
  }
  if (plan.offersToWithdraw.length) {
    await supa.from("vehicle_offers").delete().in("id", plan.offersToWithdraw)
  }

  for (const s of plan.strandedPassengers) {
    if (s.member_id === actingMemberId) continue
    const o = offers.find(x => x.id === s.offer_id)
    const driverName = o?.driver ? resolveMemberName(o.driver, { viewerId: s.member_id, fallback: null })
      : o?.driver_contact?.name || null
    await notify(s.member_id, eventId, "vehicle_offer_seat_removed",
      buildDriverCancelledMessage({ driverName, eventTitle: title }), undefined, actingMemberId)
  }

  if (plan.freedSeats.length) {
    let owner = null
    if (ownerMemberId) {
      const { data } = await supa.from("members").select("id, name, display_name, hide_name, username").eq("id", ownerMemberId).maybeSingle()
      owner = data
    } else {
      const { data } = await supa.from("contacts").select("name").eq("id", ownerContactId).maybeSingle()
      owner = data
    }
    for (const f of plan.freedSeats) {
      if (f.member_id === actingMemberId) continue
      const passengerName = ownerMemberId ? resolveMemberName(owner, { viewerId: f.member_id, fallback: null }) : owner?.name || null
      await notify(f.member_id, eventId, "vehicle_offer_seat_freed",
        buildPassengerCancelledMessage({ passengerName, seats: f.seats, eventTitle: title, reduced }), undefined, actingMemberId)
    }
  }
}

export async function releaseTransportOnCancel({ eventId, ownerMemberId = null, ownerContactId = null, actingMemberId = null }) {
  try {
    if (!eventId || (!ownerMemberId && !ownerContactId)) return
    let aq = supa.from("booking_attendees").select("member_id, contact_id").eq("event_id", eventId)
    aq = ownerMemberId ? aq.eq("owner_id", ownerMemberId) : aq.eq("owner_contact_id", ownerContactId)
    const { data: attendees } = await aq
    const ownerKey = identityKeyOf({ member_id: ownerMemberId, contact_id: ownerContactId })
    await runRelease({
      eventId, ownerMemberId, ownerContactId, actingMemberId, reduced: false,
      partyKeys: [ownerKey, ...(attendees || []).map(identityKeyOf)],
      removedGuestNames: null, // every guest on a cancelled booking goes
      stillGoingKeys: await stillGoingOutsideParty(eventId, ownerMemberId, ownerContactId),
    })
  } catch (e) {
    console.error("releaseTransportOnCancel failed", e)
  }
}

// before/after: the owner's booking_attendees rows ({member_id, contact_id,
// guest_name}) before and after the change.
export async function releaseRemovedAttendees({ eventId, ownerMemberId = null, ownerContactId = null, before = [], after = [], actingMemberId = null }) {
  try {
    if (!eventId || (!ownerMemberId && !ownerContactId)) return
    const guestKey = a => (a.guest_name ? a.guest_name.trim().toLowerCase() : null)
    const afterKeys = new Set(after.map(identityKeyOf).filter(Boolean))
    const afterGuests = new Set(after.map(guestKey).filter(Boolean))
    const removedKeys = [...new Set(before.map(identityKeyOf).filter(k => k && !afterKeys.has(k)))]
    const removedGuests = new Set(before.map(guestKey).filter(g => g && !afterGuests.has(g)))
    if (!removedKeys.length && !removedGuests.size) return

    const stillGoingKeys = await stillGoingOutsideParty(eventId, ownerMemberId, ownerContactId)
    for (const k of afterKeys) stillGoingKeys.add(k)
    await runRelease({
      eventId, ownerMemberId, ownerContactId, actingMemberId, reduced: true,
      partyKeys: removedKeys, removedGuestNames: removedGuests, stillGoingKeys,
    })
  } catch (e) {
    console.error("releaseRemovedAttendees failed", e)
  }
}

// Identity keys of everyone still going: bookers of non-cancelled bookings
// plus named attendees. Used to refuse/hide cars whose driver isn't booked.
export async function activeAttendeeKeys(eventId) {
  const [{ data: b }, { data: a }] = await Promise.all([
    supa.from("bookings").select("member_id, contact_id").eq("event_id", eventId).neq("status", "cancelled"),
    supa.from("booking_attendees").select("member_id, contact_id").eq("event_id", eventId),
  ])
  return new Set([...(b || []), ...(a || [])].map(identityKeyOf).filter(Boolean))
}
