-- 108_event_update_notify_debounce.sql
--
-- Fixes the "too many notifications for one event change" complaint (Iain,
-- 2026-09-17, re: Dementia Awareness Seminar). Root-caused with evidence
-- before building anything: pulled every event_updated notification row for
-- that one event and found 16+ separate full-attendee broadcasts over 13
-- days, several of them landing seconds or minutes apart (three saves within
-- 3 seconds on 2026-09-02, two saves 37 seconds apart on 2026-09-10, two
-- saves 4 minutes apart on 2026-09-15). The trigger condition itself
-- (event_date / event_time / location changing) was confirmed correct in
-- every route that fires it -- this is not a wrong-trigger bug, it's the
-- total absence of any debounce: every qualifying edit fires its own
-- broadcast to every current attendee, no matter how recently the last one
-- went out.
--
-- Design (confirmed with Iain 2026-09-17): a 60-minute cooldown. A
-- qualifying edit outside the cooldown sends immediately, same as today. A
-- qualifying edit inside the cooldown is held (not lost) -- flagged pending
-- with its message -- and a new daily cron (matching this project's existing
-- once-a-day cron cadence; the free/Hobby Vercel tier doesn't support a
-- tighter real-time debounce) flushes any pending event once it's gone quiet
-- for a couple of hours, sending ONE final notification reflecting the
-- latest change. See lib/notifyEventUpdated.js and
-- app/api/cron/event-update-notify-flush/route.js.
--
-- Scoped to `events` since every route that fires `event_updated` (Social,
-- Special Events, Groups & Clubs, Show Time, and Book a Space's shared-event
-- edit) already updates a row in this same table -- one shared debounce key
-- per event_id, regardless of which hub/route is doing the editing. This is
-- also why the fix lives in a new shared lib function rather than being
-- patched into any one route: this event alone moved from hub_type='social'
-- to hub_type='special' partway through its own edit history, so a
-- per-route fix would have missed half of the real broadcasts.
--
-- All three columns are additive/nullable -- safe to run before the
-- dependent code deploys, per this project's standing migration rule.

-- update_notify_pending_exclude_member_id: the editor of the most recent
-- held edit (notifyEventAttendees' excludeMemberId is per-call, not stored
-- on the row, so without this the flush cron can't self-exclude and the
-- last person to edit within the cooldown would get notified about their
-- own change).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS update_notify_last_sent_at   timestamptz,
  ADD COLUMN IF NOT EXISTS update_notify_pending        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS update_notify_last_edit_at   timestamptz,
  ADD COLUMN IF NOT EXISTS update_notify_pending_message text,
  ADD COLUMN IF NOT EXISTS update_notify_pending_exclude_member_id uuid;

-- Lets the daily flush cron find pending events without a full table scan.
CREATE INDEX IF NOT EXISTS events_update_notify_pending
  ON events (update_notify_last_edit_at)
  WHERE update_notify_pending = true;
