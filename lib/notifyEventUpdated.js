// lib/notifyEventUpdated.js
//
// Shared choke point for the `event_updated` notification, replacing direct
// notifyEventAttendees(..., 'event_updated', ...) calls from all 5 routes
// that fire it (Social, Special Events, Groups & Clubs, Show Time, Book a
// Space). Built 2026-09-17 after root-causing the Dementia Awareness Seminar
// complaint: 16+ separate full-attendee broadcasts over 13 days for one
// event, several landing seconds or minutes apart within the same edit
// session -- not a wrong-trigger bug, a total absence of debounce. See
// supabase/migrations/108_event_update_notify_debounce.sql for the schema
// and full evidence writeup.
//
// Design (confirmed with Iain 2026-09-17): 60-minute cooldown per event_id.
//   - Outside the cooldown (or never sent before): send immediately, same
//     as today's behaviour, and stamp update_notify_last_sent_at = now().
//   - Inside the cooldown: hold it. Flag update_notify_pending = true,
//     stamp update_notify_last_edit_at = now(), and store the latest
//     message/excludeMemberId so a later edit's message always wins (the
//     resident should see the most current details, not the first draft).
//     Nothing is sent for this edit.
// A separate daily cron (app/api/cron/event-update-notify-flush/route.js)
// finds events that are still pending and have gone quiet for a settle
// window, and sends ONE final notification with the latest stored message.
//
// One shared function rather than per-route logic because a single event
// can move between hubs mid-life (this one went social -> special) and
// because Book a Space fires the same notification type from a genuinely
// different trigger (title/seats, not date/time/location) -- the debounce
// key is the event, not the route.

import { notifyEventAttendees } from "@/lib/notifyEventAttendees"

const COOLDOWN_MS = 60 * 60 * 1000 // 60 minutes, confirmed with Iain 2026-09-17

export async function notifyEventDetailsChanged(supabaseAdmin, event_id, message, { excludeMemberId } = {}) {
  const nowIso = new Date().toISOString()

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('update_notify_last_sent_at')
    .eq('id', event_id)
    .single()

  // If we can't read the row for some reason, fail open and send -- missing
  // one debounce window is far better than silently dropping a real
  // date/time/location change notification.
  if (error) {
    await notifyEventAttendees(supabaseAdmin, event_id, 'event_updated', message, { excludeMemberId })
    return
  }

  const lastSentMs = event?.update_notify_last_sent_at
    ? new Date(event.update_notify_last_sent_at).getTime()
    : null
  const withinCooldown = lastSentMs !== null && (Date.now() - lastSentMs) < COOLDOWN_MS

  if (!withinCooldown) {
    await notifyEventAttendees(supabaseAdmin, event_id, 'event_updated', message, { excludeMemberId })
    await supabaseAdmin
      .from('events')
      .update({
        update_notify_last_sent_at: nowIso,
        update_notify_pending: false,
        update_notify_last_edit_at: null,
        update_notify_pending_message: null,
        update_notify_pending_exclude_member_id: null,
      })
      .eq('id', event_id)
    return
  }

  // Inside the cooldown -- hold it for the daily flush. Overwrites any
  // earlier pending message/exclude for this event, so the flush always
  // sends the latest state rather than a stale first-edit message.
  await supabaseAdmin
    .from('events')
    .update({
      update_notify_pending: true,
      update_notify_last_edit_at: nowIso,
      update_notify_pending_message: message,
      update_notify_pending_exclude_member_id: excludeMemberId || null,
    })
    .eq('id', event_id)
}
