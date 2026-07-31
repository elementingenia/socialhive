-- 072_spaces.sql
--
-- Spaces / common-area booking. Design decisions locked by Iain 2026-07-31 —
-- see the DECISIONS section of Social_Hive_Spaces_Gap_Analysis.md.
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Purely additive.
-- ============================================================================
-- Adds columns to `locations` and creates one new table. Nothing deployed reads
-- either yet, and `space_bookings` has RLS on with no policies, so it is
-- service-role-only and invisible to every client until the app code ships.
--
-- THE CORE IDEA (Iain): "the space really does sit atop the tree and then how
-- that space is being used." The Cinema is a room; a screening is one use of it,
-- a football night is another, closing it for maintenance is a third. Today the
-- model is inverted — a space is booked only as a side effect of creating an
-- event, so a use that is not an event cannot be represented at all.
--
-- `space_bookings.event_id` is therefore NULLABLE, and the foreign key lives on
-- space_bookings rather than on events. That single choice buys three things the
-- current one-location_id-per-event model cannot express:
--   * a booking with no event      — football night, a demo, maintenance
--   * an event with no booking     — offsite, or Resident's Home
--   * an event needing TWO rooms   — dinner in Main Dining, then the Lounge
--
-- NOT renaming `locations` to `spaces`: it would churn working code for no
-- functional gain. The concept is carried by space_bookings. (`space_owners` ->
-- `owners` IS agreed, but it is cosmetic and renaming a live table breaks
-- deployed code, so it waits for the wipe.)
--
-- ⚠ OUR CLASH CHECK IS NOT AUTHORITATIVE. The Ingenia resident app books these
-- same rooms and ANY resident can book there. The constraint below makes
-- Hive-vs-Hive double-booking impossible; it cannot see an Ingenia booking. UI
-- wording must say "no clash with another Hive event — check the Ingenia app",
-- never "this space is free".
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.


BEGIN;


-- ─── 0. THE EXTENSION — in the migration, never run by hand ─────────────────
-- Confirmed available on production 2026-07-31 (v1.7, not yet enabled).
--
-- It belongs HERE rather than in the SQL editor. Enabling it standalone and
-- nowhere else would recreate exactly the migration-058 drift fixed the same
-- day: production would have the extension, the repo would not know, and a
-- rebuild from migrations would fail on the constraint below.
--
-- Why it is needed: EXCLUDE builds on a GiST index, which handles range overlap
-- (&&) natively but cannot do plain equality (=) on an ordinary column like a
-- uuid. btree_gist supplies that operator class, letting "same room" and
-- "overlapping time" combine into one constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;


CREATE TEMP TABLE _before_072 AS
SELECT (SELECT count(*) FROM locations) AS locations_n,
       (SELECT count(*) FROM events)    AS events_n;


-- ─── 1. LOCATIONS GAIN THEIR OWN PROPERTIES ─────────────────────────────────
-- Iain: Locations needs its own admin area, per location.

-- Capacity: "a numeric value that sets the default capacity value for any event
-- using this location (but does not restrict it from having a larger number)".
-- So it is a SEED for events.max_seats and a warning threshold — never a limit.
-- Real capacity varies with external factors, so blocking on it would be wrong.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS capacity INTEGER
  CHECK (capacity IS NULL OR capacity > 0);

COMMENT ON COLUMN locations.capacity IS
  'Theoretical capacity. Seeds the default events.max_seats for this room and '
  'drives a warning when exceeded. Never blocks — real capacity varies (Iain, '
  '2026-07-31).';

-- Open / closed for bookings, with either an open-ended closure ("until further
-- notice", start date only) or a bounded one (from and to).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'open'
  CHECK (booking_status IN ('open', 'closed'));
ALTER TABLE locations ADD COLUMN IF NOT EXISTS closed_from   DATE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS closed_to     DATE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS closed_reason TEXT;

-- 100 characters, as specified. Enforced in the database so a longer value
-- cannot arrive from anywhere else.
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_closed_reason_len;
ALTER TABLE locations ADD  CONSTRAINT locations_closed_reason_len
  CHECK (closed_reason IS NULL OR char_length(closed_reason) <= 100);

-- A closure needs a start; an open location carries no closure detail. Keeps
-- "closed" from meaning three different things depending on which fields are set.
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_closure_coherent;
ALTER TABLE locations ADD  CONSTRAINT locations_closure_coherent CHECK (
  (booking_status = 'open'
     AND closed_from IS NULL AND closed_to IS NULL AND closed_reason IS NULL)
  OR
  (booking_status = 'closed'
     AND closed_from IS NOT NULL
     AND (closed_to IS NULL OR closed_to >= closed_from))
);


-- ─── 2. SPACE BOOKINGS — the thing that sits atop the tree ──────────────────
CREATE TABLE IF NOT EXISTS space_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,

  -- NULLABLE, and deliberately so — this is the whole point of the table.
  -- Deleting an event releases its room; a booking with no event stands alone.
  event_id     UUID REFERENCES events(id) ON DELETE CASCADE,

  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,

  purpose      TEXT NOT NULL DEFAULT 'event'
               CHECK (purpose IN ('event', 'maintenance', 'private', 'hold')),
  -- What to show when there is no event to take a title from.
  title        TEXT,
  notes        TEXT,

  status       TEXT NOT NULL DEFAULT 'confirmed'
               CHECK (status IN ('confirmed', 'cancelled')),

  -- SET NULL + snapshot, matching the foundation-rebuild convention: a booking
  -- is a record of an act and must stay readable after a person is purged.
  booked_by            UUID REFERENCES members(id) ON DELETE SET NULL,
  booked_by_name_at_time TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- SHARP EDGE 1. Without this, a zero-length booking sails through everything:
  -- tsrange('16:00','16:00') is an EMPTY range, and an empty range overlaps
  -- NOTHING, so such a row could never clash with anything and could be created
  -- without limit. Verified in the sandbox before writing this.
  CONSTRAINT space_bookings_sane_window CHECK (ends_at > starts_at)
);

-- ─── 2b. THE CONSTRAINT THAT MAKES DOUBLE-BOOKING IMPOSSIBLE ────────────────
-- Not a check the app performs — a rule the database refuses to violate, no
-- matter what writes to it.
--
-- This is the point of the whole exercise. The app-level check failed SILENTLY
-- twice in a single day: once because events.location_id had no migration
-- (058), and once because findSpaceConflict() did `const { data } = await q`,
-- discarding the error so a failed query read as "no conflict, go ahead". A
-- database constraint cannot be defeated by a destructuring bug, a forgotten
-- import, or a new route someone adds next year.
--
-- SHARP EDGE 2: the WHERE clause is load-bearing. Without it a cancelled
-- booking would block its slot forever. That exact mistake has already been
-- made here once — migration 060, "cancelled contact booking permanently
-- blocked re-booking same event", was a unique index missing this predicate.
--
-- Range bounds are [start, end) by default, so back-to-back bookings
-- (2–4pm then 4–6pm) do NOT clash. Verified across seven cases in the sandbox.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'space_bookings_no_overlap') THEN
    ALTER TABLE space_bookings ADD CONSTRAINT space_bookings_no_overlap
      EXCLUDE USING gist (
        location_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
      ) WHERE (status <> 'cancelled');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS space_bookings_location_time ON space_bookings (location_id, starts_at);
CREATE INDEX IF NOT EXISTS space_bookings_event         ON space_bookings (event_id) WHERE event_id IS NOT NULL;

COMMENT ON TABLE space_bookings IS
  'One row per USE of a room. event_id is nullable: a booking need not be an '
  'event (football night, maintenance), an event need not have a booking '
  '(offsite), and one event may hold several rooms. NOT authoritative for '
  'availability — the Ingenia app books these rooms too.';


-- ─── 3. RLS: LOCKED SHUT UNTIL THE APP CODE SHIPS ───────────────────────────
-- Enabled with no policies = service-role only, invisible to every client.
-- Same approach as migration 068. Policies land with the feature.
ALTER TABLE space_bookings ENABLE ROW LEVEL SECURITY;


-- ─── 4. VERIFY — proves the constraint bites, rather than trusting it ───────
DO $$
DECLARE
  room_a UUID; room_b UUID; keep UUID; err TEXT;
  base  TIMESTAMPTZ := '2099-01-01 14:00:00+11';   -- far future, never real data
BEGIN
  SELECT id INTO room_a FROM locations ORDER BY sort_order LIMIT 1;
  SELECT id INTO room_b FROM locations ORDER BY sort_order OFFSET 1 LIMIT 1;
  IF room_a IS NULL OR room_b IS NULL THEN
    RAISE EXCEPTION 'Need at least two locations to verify the constraint';
  END IF;

  INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
       VALUES (room_a, base, base + interval '2 hours', 'hold', 'ZZ verify base')
    RETURNING id INTO keep;

  -- 1. an overlapping booking in the SAME room must be REJECTED
  BEGIN
    INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
    VALUES (room_a, base + interval '1 hour', base + interval '3 hours', 'hold', 'ZZ overlap');
    RAISE EXCEPTION 'FAIL: an overlapping booking was ACCEPTED - the constraint is not working';
  EXCEPTION WHEN exclusion_violation THEN
    NULL;  -- expected
  END;

  -- 2. back-to-back in the same room must be ALLOWED
  INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
  VALUES (room_a, base + interval '2 hours', base + interval '4 hours', 'hold', 'ZZ back to back');

  -- 3. the same time in a DIFFERENT room must be ALLOWED
  INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
  VALUES (room_b, base, base + interval '2 hours', 'hold', 'ZZ other room');

  -- 4. a CANCELLED booking must not block the slot (the migration-060 lesson)
  UPDATE space_bookings SET status = 'cancelled' WHERE id = keep;
  INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
  VALUES (room_a, base, base + interval '2 hours', 'hold', 'ZZ replaces cancelled');

  -- 5. a zero-length booking must be REJECTED (it would overlap nothing)
  BEGIN
    INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
    VALUES (room_b, base, base, 'hold', 'ZZ zero length');
    RAISE EXCEPTION 'FAIL: a zero-length booking was ACCEPTED - it would clash with nothing';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  -- 6. a backwards window must be REJECTED
  BEGIN
    INSERT INTO space_bookings (location_id, starts_at, ends_at, purpose, title)
    VALUES (room_b, base + interval '2 hours', base, 'hold', 'ZZ backwards');
    RAISE EXCEPTION 'FAIL: ends_at before starts_at was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  DELETE FROM space_bookings WHERE title LIKE 'ZZ %';

  -- 7. the closure rules hold together
  BEGIN
    UPDATE locations SET booking_status = 'closed', closed_from = NULL WHERE id = room_a;
    RAISE EXCEPTION 'FAIL: a closure with no start date was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;
  BEGIN
    UPDATE locations SET booking_status='closed', closed_from=CURRENT_DATE,
                         closed_reason = repeat('x', 101) WHERE id = room_a;
    RAISE EXCEPTION 'FAIL: a 101-character reason was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  -- nothing was left behind, and no existing data moved
  IF EXISTS (SELECT 1 FROM space_bookings) THEN
    RAISE EXCEPTION 'FAIL: verification rows were not cleaned up';
  END IF;
  IF (SELECT locations_n FROM _before_072) <> (SELECT count(*) FROM locations)
  OR (SELECT events_n    FROM _before_072) <> (SELECT count(*) FROM events) THEN
    RAISE EXCEPTION 'Row counts changed - this migration must not add or remove rows';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE booking_status <> 'open') THEN
    RAISE EXCEPTION 'A location was left closed by the verification';
  END IF;

  RAISE NOTICE 'OK: overlap rejected, back-to-back allowed, other room allowed, cancelled frees the slot, zero-length and backwards rejected, closure rules enforced.';
END $$;


COMMIT;
