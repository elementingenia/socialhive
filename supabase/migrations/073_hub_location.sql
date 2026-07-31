-- 073_hub_location.sql
--
-- Gives a hub a NOMINATED location, so Movies is no longer hardcoded into the
-- Cinema.
--
-- Iain, 2026-07-31, correcting Gap 6 of the spaces analysis:
--   "Technically not true. The Movies Hub needs to have a nominated location
--    which is preset and locked with an edit location option (this just
--    prevents accidental changing) so Hub Owner/Admin can select if need be."
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Additive; one seeded value. Nothing deleted.
-- ============================================================================
-- Today `app/api/screenings/route.js` line 12 is `const CINEMA_NAME = "Cinema"`,
-- applied to every screening on create and edit. That rules out an outdoor
-- screening, a lounge screening, or a second community whose cinema is called
-- something else — which the multi-community work makes concrete rather than
-- hypothetical.
--
-- ⚠ NOTE THE hub_type MISMATCH, it is easy to get wrong:
--     events.hub_type      = 'movie'     (singular)
--     hub_settings.hub_type = 'movies'   (plural)
-- Live values in hub_settings are: social, home, movies, movies_suggestions,
-- movies_dvd, bookclub. This migration and the route both key on 'movies'.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.


BEGIN;


CREATE TEMP TABLE _before_073 AS
SELECT (SELECT count(*) FROM hub_settings) AS hubs_n,
       (SELECT count(*) FROM locations)    AS locations_n;


-- ─── 1. THE COLUMN ──────────────────────────────────────────────────────────
-- ON DELETE SET NULL: deleting a venue must not delete the hub's settings. The
-- route falls back to its default name if this is null, so the hub keeps
-- working rather than breaking on a missing room.
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS location_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'hub_settings'::regclass AND c.contype = 'f'
       AND c.confrelid = 'locations'::regclass AND a.attname = 'location_id'
  ) THEN
    ALTER TABLE hub_settings
      ADD CONSTRAINT hub_settings_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN hub_settings.location_id IS
  'The hub''s nominated venue. Preset and locked in the UI behind an explicit '
  '"edit location" affordance so it cannot be changed by accident (Iain, '
  '2026-07-31). Replaces the hardcoded CINEMA_NAME in api/screenings.';


-- ─── 2. SEED MOVIES WITH THE CINEMA ─────────────────────────────────────────
-- Preserves today's behaviour exactly: every screening already goes in the
-- Cinema, so nothing changes on the day this runs. Only the ability to change
-- it is new.
UPDATE hub_settings
   SET location_id = (SELECT id FROM locations WHERE lower(trim(name)) = 'cinema')
 WHERE hub_type = 'movies'
   AND location_id IS NULL;

-- If the Movies hub has no settings row yet, create one carrying just the
-- venue — welcome_text stays null and the hub renders as it always has.
INSERT INTO hub_settings (hub_type, location_id)
SELECT 'movies', (SELECT id FROM locations WHERE lower(trim(name)) = 'cinema')
 WHERE NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'movies');


-- ─── 3. VERIFY ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  cinema_id UUID;
  movies_loc UUID;
  probe_hub TEXT := 'zz_verify_hub';
  probe_id  UUID;
BEGIN
  SELECT id INTO cinema_id FROM locations WHERE lower(trim(name)) = 'cinema';
  IF cinema_id IS NULL THEN
    RAISE WARNING 'No venue named "Cinema" — Movies has no nominated location. Set one in Admin > Movies.';
  ELSE
    SELECT location_id INTO movies_loc FROM hub_settings WHERE hub_type = 'movies';
    IF movies_loc IS DISTINCT FROM cinema_id THEN
      RAISE EXCEPTION 'Movies hub was not pointed at the Cinema (got %)', movies_loc;
    END IF;
  END IF;

  -- prove ON DELETE SET NULL rather than trusting it: a hub must survive its
  -- venue being deleted, because the alternative is losing the welcome text too
  INSERT INTO locations (name, sort_order) VALUES ('ZZ Verify Venue 073', 9301) RETURNING id INTO probe_id;
  INSERT INTO hub_settings (hub_type, location_id) VALUES (probe_hub, probe_id);
  DELETE FROM locations WHERE id = probe_id;
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = probe_hub) THEN
    RAISE EXCEPTION 'Deleting a venue DELETED the hub settings row - must be ON DELETE SET NULL';
  END IF;
  IF (SELECT location_id FROM hub_settings WHERE hub_type = probe_hub) IS NOT NULL THEN
    RAISE EXCEPTION 'location_id was not nulled when the venue was deleted';
  END IF;
  DELETE FROM hub_settings WHERE hub_type = probe_hub;

  -- nothing left behind, nothing real disturbed
  IF EXISTS (SELECT 1 FROM locations WHERE name LIKE 'ZZ Verify Venue%') THEN
    RAISE EXCEPTION 'Verification venue was not cleaned up';
  END IF;
  IF (SELECT locations_n FROM _before_073) <> (SELECT count(*) FROM locations) THEN
    RAISE EXCEPTION 'locations row count changed';
  END IF;

  RAISE NOTICE 'OK: hub_settings.location_id added, Movies nominated to the Cinema, ON DELETE SET NULL proven.';
END $$;


COMMIT;
