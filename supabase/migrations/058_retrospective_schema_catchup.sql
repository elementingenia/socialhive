-- 058_retrospective_schema_catchup.sql
--
-- RETROSPECTIVE. Written 2026-07-30, long after these columns reached production.
--
-- ============================================================================
-- THIS IS A NO-OP ON PRODUCTION. Every column below already exists there.
-- ============================================================================
-- Its purpose is to make the repo a true description of the schema. Six columns
-- are live in production with NO migration in this folder that creates them —
-- the numbering jumps 057 -> 059, and `058_*.sql` is not on main, not on any
-- remote branch, and nowhere in git history. They were applied directly from
-- chat and the file was never committed.
--
--   events.location_id       ] the Event Clash / Space Double-Booking work
--   events.event_end_time    ] (PR #7, 2026-07-23)
--   events.legacy_id         ]
--   members.legacy_id        ] the legacy member/movie import, 2026-07-13
--   movies.legacy_id         ]
--   movies.rating_rt           origin unknown
--
-- WHY THIS MATTERS. Anyone rebuilding the schema from these migrations — a
-- staging environment, a second community, the multi-community foundation
-- rebuild — gets a database where `events.location_id` does not exist, and
-- **common-area double-booking protection silently stops working**.
--
-- Silently is the exact word. findSpaceConflict() in lib/eventClash.js ends:
--
--     const { data } = await q      <- `error` is destructured away, never read
--     if (!data?.length) return null
--
-- With the column missing, PostgREST returns an error and no rows. `data` is
-- null, `!data?.length` is true, and the function returns null — which its
-- callers read as "no conflict, go ahead". So two events would be booked into
-- the same room at the same time with no error, no warning, and nothing in the
-- logs. Verified against a replica built from these migrations: the column is
-- genuinely absent.
--
-- Same silent-failure class as the missing testbot fixture, which broke CI on
-- every run for its entire visible history before anyone noticed.
--
-- Definitions below were read from the LIVE PostgREST schema, not inferred from
-- the code, so they match production exactly.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.


BEGIN;


-- ─── 0. RECORD THE "BEFORE" STATE ───────────────────────────────────────────
-- So §3 can PROVE this changed no data, rather than asserting it.
CREATE TEMP TABLE _before_058 AS
SELECT (SELECT count(*) FROM events)  AS events_n,
       (SELECT count(*) FROM members) AS members_n,
       (SELECT count(*) FROM movies)  AS movies_n;


-- ─── 1. THE COLUMNS ─────────────────────────────────────────────────────────
-- All nullable with no default, exactly as they are in production.

-- Space booking (PR #7). location_type/location already have migrations (021);
-- only these two were lost.
ALTER TABLE events  ADD COLUMN IF NOT EXISTS location_id     UUID;
ALTER TABLE events  ADD COLUMN IF NOT EXISTS event_end_time  TIME WITHOUT TIME ZONE;

-- Legacy import (2026-07-13): the id each row carried in the old Google Sheet,
-- kept so a re-import can be matched rather than duplicated.
ALTER TABLE events  ADD COLUMN IF NOT EXISTS legacy_id       TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS legacy_id       TEXT;
ALTER TABLE movies  ADD COLUMN IF NOT EXISTS legacy_id       TEXT;

-- Rotten Tomatoes rating, alongside the existing OMDb/TMDB rating fields.
ALTER TABLE movies  ADD COLUMN IF NOT EXISTS rating_rt       TEXT;


-- ─── 2. THE FOREIGN KEY ─────────────────────────────────────────────────────
-- events.location_id -> locations.id, confirmed present in production via the
-- live PostgREST schema ("Note: This is a Foreign Key to `locations.id`").
--
-- ADD CONSTRAINT has no IF NOT EXISTS, so this is guarded by an explicit
-- lookup. The lookup matches on the COLUMN, not on a constraint name, because
-- production's constraint name cannot be read over the REST API and assuming
-- the default `events_location_id_fkey` could create a duplicate.
--
-- ON DELETE SET NULL: a location being removed must not delete the events that
-- were held there. NOTE — the delete action actually in force on production
-- could not be observed from this sandbox. Since the constraint already exists
-- there, this block will not fire and production is unaffected either way; it
-- only governs databases built fresh from these migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'events'::regclass
       AND c.contype  = 'f'
       AND c.confrelid = 'locations'::regclass
       AND a.attname  = 'location_id'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added events.location_id -> locations.id foreign key.';
  ELSE
    RAISE NOTICE 'events.location_id foreign key already present - left alone.';
  END IF;
END $$;


-- ─── INDEXES: A KNOWN UNKNOWN, DELIBERATELY NOT GUESSED ─────────────────────
-- findSpaceConflict() filters on (location_id, event_date, archived), so the
-- original 058 may well have created a supporting index. Indexes are not
-- visible over the REST API, so whether production has one — and under what
-- name — could not be verified from here.
--
-- No index is created, on purpose. Adding one blind risks a duplicate under a
-- different name on production, and at 31 live events the table is far too
-- small for it to matter. Worth checking in the SQL editor when convenient:
--     SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'events';
-- If nothing covers location_id, add it then as a normal new migration.


-- ─── 3. VERIFY — raises if anything is wrong ────────────────────────────────
DO $$
DECLARE
  missing TEXT;
  fk_ok   BOOLEAN;
BEGIN
  SELECT string_agg(t || '.' || c, ', ') INTO missing
    FROM (VALUES ('events','location_id'), ('events','event_end_time'),
                 ('events','legacy_id'),   ('members','legacy_id'),
                 ('movies','legacy_id'),   ('movies','rating_rt')) AS v(t,c)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = v.t AND ic.column_name = v.c);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Columns still missing after migration: %', missing;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid='events'::regclass AND c.contype='f'
       AND c.confrelid='locations'::regclass AND a.attname='location_id') INTO fk_ok;
  IF NOT fk_ok THEN
    RAISE EXCEPTION 'events.location_id foreign key is missing';
  END IF;

  -- prove no data was touched
  IF (SELECT events_n  FROM _before_058) <> (SELECT count(*) FROM events)
  OR (SELECT members_n FROM _before_058) <> (SELECT count(*) FROM members)
  OR (SELECT movies_n  FROM _before_058) <> (SELECT count(*) FROM movies) THEN
    RAISE EXCEPTION 'Row counts changed - this migration must not modify data';
  END IF;

  RAISE NOTICE 'OK: all 6 columns present, FK present, no data changed.';
END $$;


COMMIT;
