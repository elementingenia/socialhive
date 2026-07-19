import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { notify } from "@/lib/notify"


// Seat-level FIFO promotion, shared by every cancellation path.
//
// Previously this lived as two separate copies -- app/api/bookings/route.js
// (self-cancel) and app/api/coordinator/route.js (EC/admin cancel-on-behalf-
// of) -- and they drifted: bookings' version handled partial/split-seat
// promotion (if a waiter's seat count doesn't fully fit in the freed
// capacity, promote what fits and shrink their waitlist row instead of
// skipping them entirely), coordinator's version didn't, so an EC cancelling
// a booking could leave seats unfilled that a self-cancel would have filled.
// Unified here (2026-07-12) so both entry points behave identically and
// can't drift apart again.
//
// When seats free up, walk the waitlist in booked_at order and promote
// seat-by-seat. If a waiter has more seats than available, partially
// promote: confirm what's available, reduce their waitlist row, and insert
// a new confirmed row for the promoted seats.
export async function promoteWaitlist(event_id) {
  const { data: event } = await supabaseAdmin
    .from("events").select("max_seats, title").eq("id", event_id).single()
  const { data: confirmedRows } = await supabaseAdmin
    .from("bookings").select("seats").eq("event_id", event_id).eq("status", "confirmed")

  let available = (event?.max_seats || 0) -
    (confirmedRows || []).reduce((s, b) => s + (b.seats || 1), 0)
  if (available <= 0) return

  const { data: waitlisted } = await supabaseAdmin
    .from("bookings").select("id, seats, member_id, event_id, booked_at, payment_status")
    .eq("event_id", event_id).eq("status", "waitlist").order("booked_at")

  for (const waiter of (waitlisted || [])) {
    if (available <= 0) break
    const waiterSeats = waiter.seats || 1
    const toConfirm   = Math.min(waiterSeats, available)
    const remaining   = waiterSeats - toConfirm

    if (remaining === 0) {
      // Fully promote — update status in place
      await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", waiter.id)
    } else {
      // Partially promote — shrink waitlist row, insert new confirmed row
      await supabaseAdmin.from("bookings").update({ seats: remaining }).eq("id", waiter.id)
      await supabaseAdmin.from("bookings").insert({
        event_id:       waiter.event_id,
        member_id:      waiter.member_id,
        seats:          toConfirm,
        status:         "confirmed",
        booked_at:      new Date().toISOString(),
        payment_status: waiter.payment_status,
      })
    }

    const eventTitle = event?.title || "the event"
    const stillWaiting = remaining > 0
      ? ` ${remaining} seat${remaining !== 1 ? "s" : ""} remain${remaining === 1 ? "s" : ""} on the waitlist.`
      : ""
    const msg = toConfirm === 1
      ? `Great news — 1 seat has been confirmed for ${eventTitle}!${stillWaiting}`
      : `Great news — ${toConfirm} seats have been confirmed for ${eventTitle}!${stillWaiting}`

    await notify(waiter.member_id, event_id, "waitlist_promoted", msg)
    available -= toConfirm
  }
}
