-- Migration 117: Event recap prompt (Happenings News nudge for coordinators)
-- Additive, nullable. Run BEFORE the app code deploys -- the new cron
-- (app/api/cron/event-recap-prompt) filters on this column and would 500
-- until it exists.
--
-- Iain, 2026-10-02: once an event has ended, send its Event Coordinators a
-- positive nudge to post a recap to Happenings News. Sent by a daily cron
-- the morning after (Iain: "Next morning is fine"). An event with no End
-- Time counts as ended at the end of its day.
--
-- recap_prompted_at: once-only per EVENT (not per coordinator) -- set after
-- the event's current coordinators have been notified. Same once-only
-- pattern as bookings.event_reminded_at (migration 064).

ALTER TABLE events ADD COLUMN IF NOT EXISTS recap_prompted_at TIMESTAMPTZ;

COMMENT ON COLUMN events.recap_prompted_at IS 'When this event''s coordinators were sent the post-event Happenings News recap nudge. NULL = not yet sent.';
