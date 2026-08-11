import { supabaseAdmin } from "@/lib/supabaseAdmin"
import { sendPushToMember } from "@/lib/push"


// Single place that creates a notification. Every server-side notification
// in the app should go through this (see lib/notifyEventAttendees.js for
// the bulk/multi-recipient variant) rather than inserting into
// `notifications` directly -- before 2026-07-14 this insert was duplicated
// across 4 separate files (app/api/bookings/route.js,
// app/api/coordinator/route.js, app/api/admin/bar-reconcile/route.js,
// lib/promoteWaitlist.js), each with its own local createNotification()
// helper. Consolidated so push (below) can be added in exactly one place
// instead of needing to be bolted onto 4 call sites that could drift.
//
// event_id may be null (e.g. bar_reconciled has no associated event).

// Types approved to also push to a resident's phone (Iain, 2026-07-14) --
// every type that actually fires except `bar_reconciled` (the Community
// Bar module is parked behind BAR_ENABLED anyway, see lib/features.js).
//
// `event_cancelled` was excluded here with a comment claiming no code path
// ever created it -- true on 2026-07-08, false by the time Movies/Social/
// Clubs all shipped a "cancel this event" action (2026-07-31 onward), each
// of which calls notifyEventAttendees(..., 'event_cancelled', ...). Found
// and fixed 2026-08-07 (Iain): a cancellation is arguably the highest-
// stakes notification in the app -- an attendee who doesn't happen to open
// the bell drawer would never learn the event they're expecting isn't
// happening. Added below, same as every other type that actually fires.
const PUSH_TYPES = new Set([
  "waitlist_promoted",
  "booking_cancelled",
  "payment_confirmed",
  "payment_submitted",
  "payment_partial",
  "payment_reminder",
  "event_reminder",
  "booking_added",
  "booking_updated",
  "event_updated",
  "event_cancelled",
  "book_return_reminder",
  "book_return_overdue",
  "club_notice_posted",
  "event_added",
  "payment_refunded",
  "question_received",
  "question_answered",
  "question_unanswered",
  "space_booking_cancelled",
  "space_request_validate",
])

// Short push-banner titles -- the in-app notification only ever needed
// `message` (the drawer already colour/icon-codes by type), but a push
// notification needs a distinct title line above the body text.
const PUSH_TITLES = {
  waitlist_promoted: "You're in!",
  booking_cancelled: "Booking cancelled",
  payment_confirmed: "Payment confirmed",
  payment_submitted: "Payment submitted",
  // Added 2026-08-11 alongside the partial/short-payment scope -- a short
  // payment recorded by the EC is its own push, distinct from the full
  // payment_confirmed one, so a resident glancing at a lock-screen banner
  // sees "$30 of $50 received" rather than a misleadingly plain "confirmed".
  payment_partial:   "Partial payment recorded",
  payment_reminder:  "Payment reminder",
  event_reminder:    "Coming up tomorrow",
  booking_added:     "You've been added",
  booking_updated:   "Booking updated",
  event_updated:     "Event updated",
  event_cancelled:   "Event cancelled",
  book_return_reminder: "Book Club reminder",
  book_return_overdue:  "Book overdue",
  club_notice_posted:   "Club notice",
  event_added:           "New event",
  payment_refunded:      "Refund processed",
  question_received:     "New question",
  question_answered:     "Answer received",
  question_unanswered:   "Question needs an answer",
  space_booking_cancelled: "Space booking cancelled",
  space_request_validate: "Confirm with Ingenia",
}

export async function notify(member_id, event_id, type, message, url, actorId) {
  // Never notify someone about their own action (Iain, 2026-07-21): cancelling
  // your own booking, editing an event you're attending, etc. Callers pass the
  // acting member as actorId; this central guard means a future call site can't
  // reintroduce self-notification by forgetting to filter.
  if (actorId && member_id === actorId) return
  try {
    await supabaseAdmin.from("notifications").insert({ member_id, event_id: event_id || null, type, message })
  } catch (_) {}

  if (PUSH_TYPES.has(type)) {
    // No event-specific deep link yet -- the notifications list is a
    // drawer opened from Header, not its own URL, and no page currently
    // reads an ?event= param to jump straight to one. Land on /home, the
    // one destination guaranteed to exist and make sense for every type.
    //
    // Deliberately NOT awaited (2026-07-14): every caller of notify() --
    // cancel_booking, promoteWaitlist's per-waiter loop, set_payment, etc.
    // -- awaits notify() as part of a user-facing request/response. Push is
    // a network round-trip per subscription to an external service (Apple/
    // Google/Mozilla); blocking the response on it added real, user-visible
    // latency to actions like Cancel Booking once push goes live, on top of
    // whatever the DB work itself takes. sendPushToMember() already treats
    // push as best-effort and swallows its own errors, so there's nothing
    // useful to await here anyway.
    sendPushToMember(member_id, { title: PUSH_TITLES[type], body: message, url: url || "/home" }).catch(() => {})
  }
}
