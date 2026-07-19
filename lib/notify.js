import { createClient } from "@supabase/supabase-js"
import { sendPushToMember } from "@/lib/push"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
// `event_cancelled` is deliberately left off this list too, but it doesn't
// matter either way -- see components/NotificationsDrawer.js, there's no
// code path left in the app that ever creates that type.
const PUSH_TYPES = new Set([
  "waitlist_promoted",
  "booking_cancelled",
  "payment_confirmed",
  "payment_submitted",
  "payment_reminder",
  "booking_added",
  "event_updated",
  "book_return_reminder",
  "book_return_overdue",
  "club_notice_posted",
  "event_added",
])

// Short push-banner titles -- the in-app notification only ever needed
// `message` (the drawer already colour/icon-codes by type), but a push
// notification needs a distinct title line above the body text.
const PUSH_TITLES = {
  waitlist_promoted: "You're in!",
  booking_cancelled: "Booking cancelled",
  payment_confirmed: "Payment confirmed",
  payment_submitted: "Payment submitted",
  payment_reminder:  "Payment reminder",
  booking_added:     "You've been added",
  event_updated:     "Event updated",
  book_return_reminder: "Book Club reminder",
  book_return_overdue:  "Book overdue",
  club_notice_posted:   "Club notice",
  event_added:           "New event",
}

export async function notify(member_id, event_id, type, message) {
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
    sendPushToMember(member_id, { title: PUSH_TITLES[type], body: message, url: "/home" }).catch(() => {})
  }
}
