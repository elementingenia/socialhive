// Releases a cancelled booking party's car arrangements (BUG-102, 2026-10-28).
// Called by BOTH cancel paths -- self-cancel (DELETE /api/bookings) and EC
// cancel (/api/coordinator cancel_booking) -- so they can't drift. The rules
// live in lib/vehicleOffers.js's planCancelTransportRelease (pure, tested).
//
//  - A car driven by anyone in the party is withdrawn; everyone else riding
//    in it is told the driver isn't going and to choose another way.
//  - The party's seats in other people's cars are freed; those drivers are
//    told the seats are free again.
//
// Call it BEFORE the party's booking_attendees rows are deleted, or named
// attendees who were driving won't be recognised as part of the party.
// Best-effort: a failure here is logged, never blocks the cancel itself.

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import {
  identityKeyOf, planCancelTransportRelease,
  buildDriverCancelledMessage, buildPassengerCancelledMessage,
} from "@/lib/vehicleOffers"

export async function releaseTransportOnCancel({ eventId, ownerMemberId = null, ownerContactId = null, actingMemberId = null }) {
  try {
    if (!eventId || (!ownerMemberId && !ownerContactId)) return
    const ownerKey = identityKeyOf({ member_id: ownerMemberId, contact_id: ownerContactId })

    let aq = supa.from("booking_attendees").select("member_id, contact_id").eq("event_id", eventId)
    aq = ownerMemberId ? aq.eq("owner_id", ownerMemberId) : aq.eq("owner_contact_id", ownerContactId)
    const [{ data: attendees }, { data: offers }, { data: event }] = await Promise.all([
      aq,
      supa.from("vehicle_offers").select(`id, member_id, contact_id,
        driver:members!member_id(id, name, display_name, hide_name, username),
        driver_contact:contacts!contact_id(id, name),
        passengers:vehicle_offer_passengers(id, member_id, contact_id, guest_name, party_owner_member_id, party_owner_contact_id)`)
        .eq("event_id", eventId),
      supa.from("events").select("title").eq("id", eventId).maybeSingle(),
    ])
    if (!offers?.length) return

    const partyKeys = [ownerKey, ...(attendees || []).map(identityKeyOf)]
    const plan = planCancelTransportRelease({ offers, partyKeys, ownerKey })
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
          buildPassengerCancelledMessage({ passengerName, seats: f.seats, eventTitle: title }), undefined, actingMemberId)
      }
    }
  } catch (e) {
    console.error("releaseTransportOnCancel failed", e)
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
