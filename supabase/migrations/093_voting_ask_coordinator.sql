-- Voting Hub — allow "Ask" on the event coordinator's name (round-7 review,
-- Iain 2026-09-03: "Coordinator name is supposed to be in BOLD and in the
-- colour of the HUB. It is clickable so users can ask a question of the
-- coordinator/s"). Every other hub/club event tile already has this via the
-- shared EventCoordinators component + Questions' context_type = 'event',
-- but that path resolves against the shared `events` table and its
-- `event_coordinators` join table (lib/questionRouting.js's eventECIds/
-- eventParentOwnerIds) — voting events live entirely in their own
-- `voting_events` table with a single `coordinator_id` column, never in
-- `events`. Reusing context_type='event' for a voting event id would
-- silently misroute: eventECIds() finds no event_coordinators row,
-- eventParentOwnerIds() finds no events row, so primaryAnswererIds()
-- would fall through to "every admin" and contextLabel() would show
-- "an event" instead of the real title — a real gap, not just styling.
--
-- Purely additive: widens the existing CHECK constraint (same pattern as
-- 065_category_questions.sql widening it for 'category') to also accept
-- 'voting_event'. No data migration needed — no question has ever used
-- this context_type before now.

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_context_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_context_type_check
  CHECK (context_type IN ('general', 'hub', 'club', 'event', 'category', 'voting_event'));
