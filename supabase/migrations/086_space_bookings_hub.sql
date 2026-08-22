-- 086_space_bookings_hub.sql
--
-- Book a Space hub — first migration slice. Scope:
-- Book_a_Space_Scope_v2.md / Book_a_Space_Technical_Design.md (Iain, 2026-08-22).
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Purely additive.
-- ============================================================================
--
-- This does NOT touch space_bookings' schema — migration 072 already added
-- event_id (nullable) specifically so a booking can optionally also be an
-- event. Confirmed by reading that migration's own comment before writing
-- this one, rather than assuming: "a booking need not be an event ... an
-- event need not have a booking ... one event may hold several rooms." This
-- feature is the first real use of that column for its intended purpose.
--
-- Two things only:
--   1. Widen events_hub_type_check to add 'space' (same shape as migration
--      045 adding 'club'/'shed').
--   2. Seed one hub_settings row for it (migration 015's pattern) so Page
--      Texts / welcome text works the same as every other hub from day one.
--
-- Hub name "Space Bookings" (Iain, 2026-08-22, superseding the "Gatherings"
-- working name from v1). Colour is #f97316 (Iain, 2026-08-22 — the middle
-- shade of a 5-point amber-to-orange range, chosen to carry the lineage of
-- the app's original "Hive amber" colour used in the old scope docs without
-- literally reusing --amber, which is the app's fallback/no-hub colour and
-- would make this hub visually indistinguishable from generic chrome).
-- Colour/icon are frontend constants (lib/navUtils.js HUB_COLOURS,
-- components/NavIcons.js), not DB columns — hub_settings has never carried
-- either (checked: only hub_type/welcome_text/sub_messages/location_id
-- across migrations 015/016/073/080), so this migration doesn't add them.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_hub_type_check;
ALTER TABLE events ADD CONSTRAINT events_hub_type_check
  CHECK (hub_type IN ('movie', 'bookclub', 'social', 'outings', 'club', 'shed', 'space'));

INSERT INTO hub_settings (hub_type) VALUES ('space')
  ON CONFLICT (hub_type) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'space') THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for space was not created';
  END IF;

  -- prove the constraint text itself now lists 'space', rather than trusting
  -- the ALTER succeeded silently
  SELECT pg_get_constraintdef(oid) INTO constraint_def
    FROM pg_constraint WHERE conname = 'events_hub_type_check';
  IF constraint_def NOT LIKE '%''space''%' THEN
    RAISE EXCEPTION 'FAIL: events_hub_type_check does not list ''space'': %', constraint_def;
  END IF;

  RAISE NOTICE 'OK: events_hub_type_check widened to include ''space'', hub_settings seeded.';
END $$;

COMMIT;
