-- Migration 105: events.booking_required — "open, all welcome" events
-- Run in Supabase SQL Editor after 104_survey_coordinators.sql
--
-- Iain (2026-09-11): some club events don't need a seating capacity or a
-- booking at all — just an "All Welcome" mechanism, no RSVP required.
-- Dry-run scope: Groups & Clubs only for now (app/api/clubs/events,
-- components/ClubHome.js, components/EventSlideOut.js). Every other hub
-- never sets this column, so it stays at its default (true) and nothing
-- about Social/Show Time/Special Events/Spaces changes.
--
-- Decisions confirmed with Iain before building:
--   - An open event (booking_required = false) can NOT be paid — payment is
--     wired through the booking record, and there is no booking on an open
--     event. The Clubs form hides "Paid event" entirely when Booking is set
--     to Open, and the server forces payment_required=false/cost=0 either
--     way (see app/api/clubs/events/route.js).
--   - No booking-triggered reminder/notification pipeline applies to an open
--     event, since none of it is booking-keyed — this is inherent, not a
--     separate code change (no bookings ever exist to remind/notify about).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS booking_required BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN events.booking_required IS
  'false = "open, all welcome" event: no capacity, no booking/RSVP, no payment. Groups & Clubs only as of 2026-09-11; every other hub always leaves this at its default (true).';

-- Recurring-series template (event_series) needs the same flag so a series
-- created/edited as "open" propagates it to every generated occurrence
-- (see app/api/series/route.js, lib/generateSeriesEvents.js).
ALTER TABLE event_series
  ADD COLUMN IF NOT EXISTS booking_required BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN event_series.booking_required IS
  'Template value propagated onto every generated occurrence''s events.booking_required. Same "open, all welcome" meaning as events.booking_required.';
