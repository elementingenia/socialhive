// Shared display/lifecycle logic for notifications -- currently just the
// event_reminder day-relative rewording + auto-expiry, split out of
// app/api/notifications/route.js so it's unit-testable, matching this
// project's convention (lib/booking.js's eventReminderDue,
// lib/payments.js's paymentReminderDue) of keeping date-relative decisions
// in a pure lib function rather than inline in the route.
import { sydneyTodayStr, isEventPast } from "./date.js"

// A day-before "event_reminder" (app/api/cron/event-reminder-check) writes
// its message ONCE, at creation time, hardcoding the word "tomorrow" -- so a
// resident who doesn't open the bell until the day of the event (or after it
// has already started) sees permanently stale wording. Reported by Iain
// 2026-08-30 via screenshot: "The Way" still read "is tomorrow at 18:00"
// while being viewed on the actual day of the screening, well after the
// reminder was created. Recompute the display text fresh from the event's
// real event_date/event_time on every read, rather than trusting the frozen
// stored string. Scoped to `event_reminder` only -- the one type whose whole
// point is a day-relative claim that can go stale; other types
// (payment_reminder, book_return_reminder, etc.) don't carry "tomorrow"
// wording and aren't evidenced as broken.
export function rewordEventReminder(n, now = new Date()) {
  if (n?.type !== "event_reminder" || !n.events?.event_date) return n
  const ev = n.events
  const past = isEventPast(ev, now)
  const today = sydneyTodayStr(now)
  const timeText = ev.event_time ? ` at ${ev.event_time.slice(0, 5)}` : ""
  const whereText = ev.location ? ` (${ev.location})` : ""
  const dayWord = past ? "was" : ev.event_date === today ? "is today" : "is tomorrow"
  return {
    ...n,
    message: `Reminder: ${ev.title || "your event"} ${dayWord}${timeText}${whereText}.`,
  }
}

// Is this notification a day-before reminder whose event has now actually
// started? If so it's no longer actionable -- there's nothing left to
// remind anyone of -- so per Iain's explicit ask ("should not remain active
// for attention") it should stop counting as unread the moment this is
// true, not sit indefinitely until someone happens to open the drawer.
export function isExpiredEventReminder(n, now = new Date()) {
  return n?.type === "event_reminder" && !n.read_at && isEventPast(n.events, now)
}
