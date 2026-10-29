// Server half of "a resident bus driver always has a seat" (Iain,
// 2026-10-29 -- Men's Race Day). Rules live in lib/busDriver.js
// (planBusDriverSeat, pure + tested); this file does the reads, writes and
// notifications.
//
// Idempotent: safe to call after ANY change to an event or its bookings.
// Called after an event is saved (Social, Special Events, Groups & Clubs)
// and after booking changes that could take the driver's seat away or put
// them on the bus / in a car.
//
//  - No seat at all            -> book 1 confirmed seat, even over the limit.
//  - Only on the waitlist      -> 1 seat moved to confirmed.
//  - Has a seat                -> nothing to book.
//  - Always: the driver is taken off the bus passenger list, out of any car
//    (their own car offer is withdrawn) and off "own way".
//  - previousDriverId (driver changed/removed): that resident keeps their
//    seat and is told to choose how they're getting there.
// Best-effort: a failure is logged, never blocks the save that called it.

import { supabaseAdmin as supa } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"
import { resolveMemberName } from "@/lib/memberName"
import { planBusDriverSeat, residentBusDriverId } from "@/lib/busDriver"
import { amountOwing, payableSeats, derivePaymentStatus } from "@/lib/payments"

export async function ensureBusDriverSeat(eventId, { previousDriverId = null, actingMemberId = null } = {}) {
  try {
    if (!eventId) return
    const { data: event } = await supa.from("events")
      .select("id, title, has_bus, bus_driver_id, bus_driver_free, booking_required, archived, payment_required, cost")
      .eq("id", eventId).maybeSingle()
    if (!event) return
    const title = event.title || "this event"
    const driverId = residentBusDriverId(event)

    // Replaced / removed driver keeps their seat; tell them to pick transport.
    if (previousDriverId && previousDriverId !== driverId && !event.archived) {
      const { data: still } = await supa.from("bookings").select("id")
        .eq("event_id", eventId).eq("member_id", previousDriverId).eq("status", "confirmed").limit(1)
      const msg = still?.length
        ? `You're no longer the bus driver for ${title}. Your seat is still booked -- please choose how you're getting there.`
        : `You're no longer the bus driver for ${title}.`
      await notify(previousDriverId, eventId, "booking_updated", msg, undefined, actingMemberId)
    }
    // A replaced driver pays like anyone else again.
    if (previousDriverId && previousDriverId !== driverId) await syncPaymentStatus(event, previousDriverId)

    const [{ data: own }, { data: named }, { data: confirmedOwners }] = await Promise.all([
      driverId ? supa.from("bookings").select("id, status, seats, payment_status")
        .eq("event_id", eventId).eq("member_id", driverId).neq("status", "cancelled") : { data: [] },
      driverId ? supa.from("booking_attendees").select("id, owner_id, owner_contact_id")
        .eq("event_id", eventId).eq("member_id", driverId) : { data: [] },
      supa.from("bookings").select("member_id, contact_id").eq("event_id", eventId).eq("status", "confirmed"),
    ])
    const confirmedOwnerKeys = new Set((confirmedOwners || [])
      .map(b => (b.member_id ? `m:${b.member_id}` : b.contact_id ? `c:${b.contact_id}` : null)).filter(Boolean))

    const plan = planBusDriverSeat({ event, bookings: own || [], namedRows: named || [], confirmedOwnerKeys })
    if (plan.action === "none") return

    const now = new Date().toISOString()
    const paymentStatus = event.payment_required ? "pending" : "not_required"
    let seated = false

    if (plan.action === "create") {
      const { error } = await supa.from("bookings").insert({
        event_id: eventId, member_id: driverId, seats: 1, status: "confirmed",
        booked_at: now, payment_status: paymentStatus, bus_passenger: false, own_way: false,
      })
      if (error) { console.error("ensureBusDriverSeat insert failed", error); return }
      seated = true
    } else if (plan.action === "promote_waitlist") {
      if (plan.seats <= 1) {
        await supa.from("bookings").update({ status: "confirmed", bus_passenger: false, own_way: false, updated_at: now }).eq("id", plan.bookingId)
      } else {
        const wait = (own || []).find(b => b.id === plan.bookingId)
        await supa.from("bookings").update({ seats: plan.seats - 1, updated_at: now }).eq("id", plan.bookingId)
        await supa.from("bookings").insert({
          event_id: eventId, member_id: driverId, seats: 1, status: "confirmed",
          booked_at: now, payment_status: wait?.payment_status || paymentStatus, bus_passenger: false, own_way: false,
        })
      }
      seated = true
    } else if (plan.action === "keep_own") {
      await supa.from("bookings").update({ bus_passenger: false, own_way: false })
        .eq("event_id", eventId).eq("member_id", driverId).neq("status", "cancelled")
    }

    // Never a bus passenger on anyone's party (their own or someone else's).
    await supa.from("booking_attendees").update({ is_bus_passenger: false })
      .eq("event_id", eventId).eq("member_id", driverId).eq("is_bus_passenger", true)

    await takeDriverOutOfCars({ eventId, driverId, title, actingMemberId })
    await syncPaymentStatus(event, driverId)

    if (seated) {
      await notify(driverId, eventId, "booking_added",
        `You're the bus driver for ${title}, so a seat has been booked for you.`, undefined, actingMemberId)
    }
  } catch (e) {
    console.error("ensureBusDriverSeat failed", e)
  }
}

// The bus driver can't also ride in a car or drive one.
async function takeDriverOutOfCars({ eventId, driverId, title, actingMemberId }) {
  const { data: offers } = await supa.from("vehicle_offers")
    .select("id, member_id, passengers:vehicle_offer_passengers(id, member_id)")
    .eq("event_id", eventId)
  if (!offers?.length) return
  const { data: driverRow } = await supa.from("members")
    .select("id, name, display_name, hide_name, username").eq("id", driverId).maybeSingle()

  // A seat in someone else's car: free it, tell that car's driver.
  for (const o of offers) {
    if (o.member_id === driverId) continue
    const mine = (o.passengers || []).filter(p => p.member_id === driverId)
    if (!mine.length) continue
    await supa.from("vehicle_offer_passengers").delete().in("id", mine.map(p => p.id))
    if (o.member_id) {
      const who = resolveMemberName(driverRow, { viewerId: o.member_id, fallback: "A resident" })
      await notify(o.member_id, eventId, "vehicle_offer_seat_freed",
        `${who} is driving the bus to ${title}, so their seat in your car is free again.`, undefined, actingMemberId)
    }
  }

  // Their own car offer: withdraw it, tell anyone who was riding in it.
  for (const o of offers.filter(x => x.member_id === driverId)) {
    for (const p of o.passengers || []) {
      if (p.member_id && p.member_id !== driverId) {
        const who = resolveMemberName(driverRow, { viewerId: p.member_id, fallback: "Your driver" })
        await notify(p.member_id, eventId, "vehicle_offer_seat_removed",
          `${who} is now driving the bus to ${title}, so their car isn't going. Please choose another way to get there.`,
          undefined, actingMemberId)
      }
    }
    await supa.from("vehicle_offers").delete().eq("id", o.id)
  }
}

// "Driver doesn't pay" (migration 145): keep the member's confirmed booking's
// payment_status matching what they actually owe -- not_required when their
// only seat is the free driver seat, pending when the toggle is off or they
// stop being the driver. Only touches a booking with no money recorded and
// no unresolved self-report; anything with money on it is left for the
// coordinator to settle.
async function syncPaymentStatus(event, memberId) {
  if (!event?.payment_required || !memberId) return
  const { data: b } = await supa.from("bookings").select("id, seats, member_id, payment_status, amount_paid")
    .eq("event_id", event.id).eq("member_id", memberId).eq("status", "confirmed").maybeSingle()
  if (!b) return
  if (!["pending", "not_required"].includes(b.payment_status)) return
  if ((Number(b.amount_paid) || 0) > 0) return
  const next = derivePaymentStatus(0, amountOwing(event, payableSeats(b, event)))
  if (next !== b.payment_status) {
    await supa.from("bookings").update({ payment_status: next, updated_at: new Date().toISOString() }).eq("id", b.id)
  }
}
