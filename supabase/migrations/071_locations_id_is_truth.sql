-- 071_locations_id_is_truth.sql
--
-- Makes events.location_id the source of truth for ONSITE events, so renaming a
-- location can never invalidate an event record.
--
-- Iain, 2026-07-31: "The free text in Off-site is deliberate and always for
-- informational purposes only to the event and attendees. All we 'care' about is
-- that the onsite events have a correct location stored (by location ID in the
-- database) so that when the location name is edited, the record stays valid."
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Additive + a backfill. No data is deleted.
-- ============================================================================
--
-- THE BUG THIS CLOSES (reachable today, silent):
--   1. Admin renames "Community Lounge" -> "The Lounge". Nothing cascades.
--   2. An existing event still stores location = "Community Lounge".
--   3. Someone edits ANY field on that event. The picker renders the stored
--      value whether or not it is still a valid option, so the old name looks
--      perfectly normal.
--   4. On save, resolveLocationId("Community Lounge") finds nothing -> null.
--   5. findSpaceConflict() opens with `if (!location_id) return null` -> "no
--      conflict".
--   6. The event saves with location_id = NULL.
--   => Editing an unrelated field silently unbooks the room and drops the event
--      out of double-booking protection, while still displaying the old name.
--
-- events.location is KEPT as a display denormalisation (15 read sites across 8
-- files) but is no longer authoritative for onsite events. §4's trigger keeps it
-- honest, in the database, so it cannot be bypassed by the admin UI, a script,
-- or the Supabase dashboard.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.


BEGIN;


-- ─── 0. RECORD THE "BEFORE" STATE ───────────────────────────────────────────
CREATE TEMP TABLE _before_071 AS
SELECT (SELECT count(*) FROM events)    AS events_n,
       (SELECT count(*) FROM locations) AS locations_n,
       (SELECT count(*) FROM events
         WHERE location_type = 'onsite' AND location_id IS NULL
           AND archived = false)        AS onsite_unlinked_n;


-- ─── 1. bookable — replaces a regex on the NAME ─────────────────────────────
-- lib/eventClash.js identified the "not a real shared space" case with
--     /resident/i.test(locationName)
-- which over-matches badly, because "P-resident" contains "resident":
--
--     Resident's Home      -> exempt   (intended)
--     President's Suite    -> EXEMPT   (wrong)
--     Presidents Lounge    -> EXEMPT   (wrong)
--     Vice-President Room  -> EXEMPT   (wrong)
--
-- An exempt room is silently excluded from the end-time requirement AND from
-- double-booking checks entirely. Latent today (no such room exists) but an
-- admin can create one from the Locations screen at any time.
--
-- A property of the room belongs on the room, not in a pattern match.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN locations.bookable IS
  'False = not a shared bookable space (Resident''s Home, and any facility that '
  'should not be reservable). Exempt from the end-time requirement and from '
  'space-clash checking. Replaces the isResidentsHome() name regex.';

-- Mark the existing exemption. Matched on the apostrophe-agnostic form because
-- the live row uses a curly apostrophe (Resident’s Home).
UPDATE locations
   SET bookable = false
 WHERE replace(lower(name), '’', '''') LIKE '%resident''s home%'
    OR lower(name) = 'residents home';


-- ─── 2. UNIQUE name — closes the maybeSingle() ambiguity ────────────────────
-- resolveLocationId() does .eq("name", …).maybeSingle(). maybeSingle ERRORS when
-- more than one row matches, the caller reads only `data`, and the error becomes
-- an undefined -> null -> "no space booked". Nothing stopped an admin creating
-- two locations with the same name, because migration 050 declared `name TEXT
-- NOT NULL` and nothing else.
--
-- Case-insensitive, so "Cinema" and "cinema" cannot coexist either.
DO $$
DECLARE dupes TEXT;
BEGIN
  SELECT string_agg(name, ', ') INTO dupes
    FROM (SELECT min(name) AS name FROM locations
           GROUP BY lower(trim(name)) HAVING count(*) > 1) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add the unique index - these location names are already duplicated: %. Merge or rename them first.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS locations_name_unique
  ON locations (lower(trim(name)));


-- ─── 3. BACKFILL events.location_id ─────────────────────────────────────────
-- TIME-SENSITIVE, which is why this is being done now rather than at the wipe:
-- it can only work while the stored names still match the locations table. Every
-- rename between now and then would permanently lose a link.
--
-- Onsite events only. Offsite location text is deliberate free text and is left
-- completely alone.
UPDATE events e
   SET location_id = l.id
  FROM locations l
 WHERE e.location_id IS NULL
   AND e.location_type = 'onsite'
   AND e.location IS NOT NULL
   AND lower(trim(e.location)) = lower(trim(l.name));

-- Events whose stored name matches no location keep location_id = NULL. There is
-- nothing to point them at and inventing one would be worse than leaving the gap
-- visible. Known case: "Bastille Day" (2026-07-14) stores "Community Hall",
-- which predates the locations table (seeded 2026-07-18) — see §5's report.


-- ─── 4. THE TRIGGER — a rename can never orphan a record ────────────────────
-- This is the actual fix for Iain's question. events.location stays as a display
-- copy, and the database guarantees it matches the room it points at.
--
-- In the DB rather than in the admin route on purpose: the rename is a plain
-- client-side `supabase.from('locations').update({name})` (admin/page.js:1995),
-- so an app-level cascade would be bypassed by the Supabase dashboard, any
-- script, or a second UI added later. A trigger cannot be bypassed.
CREATE OR REPLACE FUNCTION sync_event_location_name()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE events
       SET location = NEW.name
     WHERE location_id = NEW.id
       AND location IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_event_location_name_trigger ON locations;
CREATE TRIGGER sync_event_location_name_trigger
  AFTER UPDATE OF name ON locations
  FOR EACH ROW
  EXECUTE FUNCTION sync_event_location_name();


-- ─── 5. VERIFY — raises if anything is wrong ────────────────────────────────
DO $$
DECLARE
  linked_now  INTEGER;
  still_null  INTEGER;
  orphan_list TEXT;
  probe_id    UUID;
  probe_ev    UUID;
  old_name    TEXT;
  seen_name   TEXT;
BEGIN
  -- the backfill did something, and nothing lost a link
  SELECT count(*) INTO still_null FROM events
   WHERE location_type = 'onsite' AND location_id IS NULL AND archived = false;
  linked_now := (SELECT onsite_unlinked_n FROM _before_071) - still_null;
  RAISE NOTICE 'Backfill linked % onsite event(s); % still unlinked.', linked_now, still_null;

  SELECT string_agg(DISTINCT coalesce(location,'(null)'), ', ') INTO orphan_list
    FROM events
   WHERE location_type = 'onsite' AND location_id IS NULL AND archived = false;
  IF orphan_list IS NOT NULL THEN
    RAISE NOTICE 'Unmatched onsite location names (expected - legacy, pre-dropdown): %', orphan_list;
  END IF;

  -- no offsite event was touched
  IF EXISTS (SELECT 1 FROM events WHERE location_type = 'offsite' AND location_id IS NOT NULL) THEN
    RAISE EXCEPTION 'An offsite event was given a location_id - the backfill must be onsite-only';
  END IF;

  -- row counts unchanged
  IF (SELECT events_n    FROM _before_071) <> (SELECT count(*) FROM events)
  OR (SELECT locations_n FROM _before_071) <> (SELECT count(*) FROM locations) THEN
    RAISE EXCEPTION 'Row counts changed - this migration must not add or remove rows';
  END IF;

  -- PROVE the trigger fires, rather than trusting that it was created
  SELECT id, name INTO probe_id, old_name FROM locations WHERE bookable = true LIMIT 1;
  IF probe_id IS NOT NULL THEN
    INSERT INTO events (title, event_date, event_time, location_type, location, location_id)
         VALUES ('ZZ Trigger Probe', CURRENT_DATE, '19:00', 'onsite', old_name, probe_id)
      RETURNING id INTO probe_ev;

    UPDATE locations SET name = 'ZZ Renamed Probe Room' WHERE id = probe_id;
    SELECT location INTO seen_name FROM events WHERE id = probe_ev;
    IF seen_name IS DISTINCT FROM 'ZZ Renamed Probe Room' THEN
      RAISE EXCEPTION 'TRIGGER FAILED: after rename the event still reads "%"', seen_name;
    END IF;

    -- put it back, and confirm the trigger tracks that too
    UPDATE locations SET name = old_name WHERE id = probe_id;
    SELECT location INTO seen_name FROM events WHERE id = probe_ev;
    IF seen_name IS DISTINCT FROM old_name THEN
      RAISE EXCEPTION 'TRIGGER FAILED on the way back: event reads "%"', seen_name;
    END IF;

    DELETE FROM events WHERE id = probe_ev;
    RAISE NOTICE 'OK: rename cascade proven - event name followed the room in both directions.';
  END IF;

  -- the exemption moved off the regex and onto the row
  IF NOT EXISTS (SELECT 1 FROM locations WHERE bookable = false) THEN
    RAISE WARNING 'No location is marked bookable=false - check Resident''s Home was matched.';
  END IF;

  RAISE NOTICE 'OK: bookable flag set, unique name index, backfill done, trigger live.';
END $$;


COMMIT;
