// Shared guard for event-level cancellation (Movies/Screenings, Social, Clubs &
// Groups) -- Iain, 2026-08-07: an event can be cancelled while it still has
// bookings, but NOT if money has already changed hands. Cancelling the whole
// event only archives it and notifies attendees -- it does nothing to the
// payment_status on any booking, so an outright cancel would either silently
// keep money that was collected, or leave an existing refund-owed row (from an
// earlier individual booking cancellation) stranded with no prompt to resolve
// it. Both cases must block the cancel with a specific reason, never a
// generic "can't cancel" -- the admin needs to know exactly what to go fix
// (mark bookings refunded via the coordinator "Mark Refunded" action) before
// retrying.
export async function checkCancelPaymentGuard(supabaseAdmin, eventId) {
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, seats, status, payment_status")
    .eq("event_id", eventId)

  // Payment collected on a still-active booking -- cancelling now would take
  // the seat away without ever accounting for the money.
  const collected = (bookings || []).filter(b => b.status !== "cancelled" && b.payment_status === "confirmed")
  // Already-cancelled booking whose payment was never refunded -- a debt the
  // event-level cancel must not be allowed to bury.
  const refundsDue = (bookings || []).filter(b => b.status === "cancelled" && b.payment_status === "confirmed")

  if (!collected.length && !refundsDue.length) return null

  const parts = []
  if (collected.length) {
    parts.push(`${collected.length} booking${collected.length !== 1 ? "s" : ""} with payment already collected`)
  }
  if (refundsDue.length) {
    parts.push(`${refundsDue.length} refund${refundsDue.length !== 1 ? "s" : ""} still owed from an earlier cancellation`)
  }
  return `Can't cancel this event -- it has ${parts.join(" and ")}. Mark those bookings refunded (Coordinator view) before cancelling the event.`
}
