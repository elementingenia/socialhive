// Shared guard for event-level cancellation (Movies/Screenings, Social, Clubs &
// Groups) -- Iain, 2026-08-07: an event can be cancelled while it still has
// bookings, but NOT if money has already changed hands. Cancelling the whole
// event only archives it and notifies attendees -- it does nothing to the
// payment_status on any booking, so an outright cancel would either silently
// keep money that was collected, or leave an existing refund-owed row (from an
// earlier individual booking cancellation) stranded with no prompt to resolve
// it. Both cases must block the cancel with a specific reason, never a
// generic "can't cancel" -- the admin needs to know exactly what to go fix
// (mark bookings refunded via the coordinator "Mark Refund Paid" action)
// before retrying.
//
// Updated 2026-08-11 for the partial-payment/refund-ledger rework: "money
// already changed hands" on an active booking now also covers 'partial'
// (some money in, not the full amount -- still money the cancel would
// otherwise silently keep), not just 'confirmed'. "Refund still owed" now
// reads the unified refund_due/refund_paid_at ledger instead of inferring
// it from payment_status alone -- catches an overpayment refund sitting on
// an active booking too, which the old payment_status-only check never saw.
import { isRefundPending } from "@/lib/payments"

export async function checkCancelPaymentGuard(supabaseAdmin, eventId) {
  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id, seats, status, payment_status, refund_due, refund_paid_at")
    .eq("event_id", eventId)

  // Payment collected (in full or partially) on a still-active booking --
  // cancelling now would take the seat away without ever accounting for
  // the money.
  const collected = (bookings || []).filter(b =>
    b.status !== "cancelled" && (b.payment_status === "confirmed" || b.payment_status === "partial"))
  // A refund not yet acknowledged as paid out -- whichever source it came
  // from (an earlier individual cancellation, or an overpayment on a
  // booking that's still active).
  const refundsDue = (bookings || []).filter(isRefundPending)

  if (!collected.length && !refundsDue.length) return null

  const parts = []
  if (collected.length) {
    parts.push(`${collected.length} booking${collected.length !== 1 ? "s" : ""} with payment already collected`)
  }
  if (refundsDue.length) {
    parts.push(`${refundsDue.length} refund${refundsDue.length !== 1 ? "s" : ""} still owed`)
  }
  return `Can't cancel this event -- it has ${parts.join(" and ")}. Mark those bookings refunded (Coordinator view) before cancelling the event.`
}
