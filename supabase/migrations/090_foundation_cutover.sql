-- 090_foundation_cutover.sql
--
-- FOUNDATION REBUILD, PART 2 OF 2 — the cutover.
--
-- ⚠ NUMBERED 090, NOT 069, ON PURPOSE. The gap is deliberate.
-- This migration is a TERMINAL transformation: it drops `members`/`contacts` and
-- repoints every person reference in the schema. Anything numbered after it must
-- be written against the post-cutover world. Numbering it 069 meant migration
-- 072 (spaces, written a day later) failed a numeric-order rebuild with
-- `relation "members" does not exist`. Sorting the cutover last removes that
-- whole class of problem instead of making every later migration defensive.
-- Leave room above it; put ordinary feature migrations in the 0xx range.
-- Scope: Social_Hive_Foundation_Scope.md (v4, approved by Iain 2026-07-30).
-- Requires: 068_foundation_new_tables.sql already applied.
--
-- ============================================================================
-- DO NOT RUN THIS UNTIL THE CLEAN-SLATE WIPE. IT DROPS members AND contacts.
-- ============================================================================
-- You do not have to remember that, though: §0 below REFUSES TO RUN while any
-- resident-facing table still holds rows. Running this today does nothing but
-- raise an exception and roll back. That guard is the whole reason it is safe
-- to have this file sitting in the repo.
--
-- Order of operations at the wipe:
--   1. 068 (already applied — additive, done ahead of time)
--   2. empty the data tables
--   3. THIS FILE
--   4. 091_foundation_rls.sql
--   5. Slice H: load people + occupancies from the reconciled dataset
--
-- Column coverage is not hand-typed: it was generated from the LIVE PostgREST
-- schema, which found 39 person-referencing columns across 27 tables (38 repointed
-- here; the 39th is contacts.member_id, and §3 drops that table outright). Two
-- separate regex sweeps of the migration files found 37 and 38 — both wrong,
-- which is why the live schema is the only source used here.
--
-- THE SNAPSHOT RULE (applied uniformly, and the reason each column differs):
--   * DISPLAYED to a user, or part of a FINANCIAL/AUDIT trail
--       -> ON DELETE SET NULL + a <col>_name_at_time text snapshot.
--          The row outlives the person and stays readable after a purge.
--   * The person's OWN data with no value once they are gone (votes, follows,
--     notifications, push subscriptions, club membership, their own questions)
--       -> ON DELETE CASCADE, no snapshot. Purge should remove it.
--   * Internal bookkeeping never shown to anyone (who assigned a coordinator)
--       -> ON DELETE SET NULL, no snapshot.
-- The snapshots CANNOT be retrofitted: once a person is purged the name is
-- gone. That is why this migration, not a later one, has to carry them.


-- ATOMIC. Without this wrapper psql autocommits statement by statement, so a
-- failure halfway through would leave the schema half-cut-over with no way back.
BEGIN;

-- ─── §0 SAFETY GUARD ────────────────────────────────────────────────────────
DO $$
DECLARE v INTEGER; t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['members','contacts','events','bookings','booking_attendees',
                           'clubs','questions','notifications'] LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO v;
    IF v > 0 THEN
      RAISE EXCEPTION
        'REFUSING TO RUN: table % still has % rows. This migration is for the clean-slate wipe only. Empty the data tables first.', t, v;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM communities WHERE slug = 'fullerton-cove') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: 068_foundation_new_tables.sql has not been applied.';
  END IF;
  RAISE NOTICE 'Guard passed: all data tables empty, 068 applied. Proceeding.';
END $$;


-- ─── §1 community_id ON EVERY SCOPED TABLE ──────────────────────────────────
-- Denormalised onto all 33 deliberately. An RLS policy that has to JOIN to find
-- the community is slower AND is where a cross-community leak hides; every policy
-- in 070 is a single-column comparison because of this.
DO $$
DECLARE c UUID; t TEXT;
BEGIN
  SELECT id INTO c FROM communities WHERE slug = 'fullerton-cove';
  FOREACH t IN ARRAY ARRAY['bar_member_payments','bar_products','bar_reconciliations','bar_tabs','book_votes','booking_attendees','bookings','books','club_bring_categories','club_members','club_notices','clubs','contact_categories','contact_category_members','document_categories','documents','dvd_loans','event_coordinators','event_series','events','hub_followers','hub_settings','locations','movie_ownership','movies','notices','notifications','push_subscriptions','question_replies','questions','settings','space_owners','votes'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS community_id UUID', t);
    EXECUTE format('UPDATE %I SET community_id = $1 WHERE community_id IS NULL', t) USING c;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN community_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN community_id SET DEFAULT NULL', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (community_id) '
                   'REFERENCES communities(id) ON DELETE CASCADE', t, t||'_community_fk');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (community_id)', t||'_community_idx', t);
  END LOOP;
END $$;


-- ─── §2 REPOINT EVERY PERSON REFERENCE AT people ────────────────────────────
-- Drops the old FK, renames where the name changes, re-adds the FK against
-- people with the ON DELETE behaviour the snapshot rule dictates.

-- bar_member_payments
ALTER TABLE bar_member_payments RENAME COLUMN member_id TO person_id;
ALTER TABLE bar_member_payments ALTER COLUMN person_id DROP NOT NULL;   -- required for ON DELETE SET NULL
ALTER TABLE bar_member_payments DROP CONSTRAINT IF EXISTS bar_member_payments_member_id_fkey;
ALTER TABLE bar_member_payments ADD CONSTRAINT bar_member_payments_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE bar_member_payments ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge
ALTER TABLE bar_member_payments DROP CONSTRAINT IF EXISTS bar_member_payments_recorded_by_fkey;
ALTER TABLE bar_member_payments ADD CONSTRAINT bar_member_payments_recorded_by_fkey FOREIGN KEY (recorded_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE bar_member_payments ADD COLUMN IF NOT EXISTS recorded_by_name_at_time TEXT;   -- survives purge

-- bar_reconciliations
ALTER TABLE bar_reconciliations DROP CONSTRAINT IF EXISTS bar_reconciliations_created_by_fkey;
ALTER TABLE bar_reconciliations ADD CONSTRAINT bar_reconciliations_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE bar_reconciliations ADD COLUMN IF NOT EXISTS created_by_name_at_time TEXT;   -- survives purge

-- bar_tabs
ALTER TABLE bar_tabs RENAME COLUMN member_id TO person_id;
ALTER TABLE bar_tabs ALTER COLUMN person_id DROP NOT NULL;   -- required for ON DELETE SET NULL
ALTER TABLE bar_tabs DROP CONSTRAINT IF EXISTS bar_tabs_member_id_fkey;
ALTER TABLE bar_tabs ADD CONSTRAINT bar_tabs_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE bar_tabs ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge

-- book_votes
ALTER TABLE book_votes RENAME COLUMN member_id TO person_id;
ALTER TABLE book_votes DROP CONSTRAINT IF EXISTS book_votes_member_id_fkey;
ALTER TABLE book_votes ADD CONSTRAINT book_votes_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- booking_attendees
ALTER TABLE booking_attendees RENAME COLUMN member_id TO person_id;
ALTER TABLE booking_attendees DROP CONSTRAINT IF EXISTS booking_attendees_member_id_fkey;
ALTER TABLE booking_attendees ADD CONSTRAINT booking_attendees_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge
ALTER TABLE booking_attendees DROP COLUMN IF EXISTS contact_id;   -- merged into person_id (one people table)
ALTER TABLE booking_attendees RENAME COLUMN owner_id TO owner_person_id;
ALTER TABLE booking_attendees DROP CONSTRAINT IF EXISTS booking_attendees_owner_id_fkey;
ALTER TABLE booking_attendees ADD CONSTRAINT booking_attendees_owner_person_id_fkey FOREIGN KEY (owner_person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE booking_attendees ADD COLUMN IF NOT EXISTS owner_name_at_time TEXT;   -- survives purge
ALTER TABLE booking_attendees DROP COLUMN IF EXISTS owner_contact_id;   -- merged into owner_person_id (one people table)

-- bookings
ALTER TABLE bookings RENAME COLUMN member_id TO person_id;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_member_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge
ALTER TABLE bookings DROP COLUMN IF EXISTS contact_id;   -- merged into person_id (one people table)

-- books
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_added_by_fkey;
ALTER TABLE books ADD CONSTRAINT books_added_by_fkey FOREIGN KEY (added_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE books ADD COLUMN IF NOT EXISTS added_by_name_at_time TEXT;   -- survives purge

-- club_members
ALTER TABLE club_members RENAME COLUMN member_id TO person_id;
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_member_id_fkey;
ALTER TABLE club_members ADD CONSTRAINT club_members_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- club_notices
ALTER TABLE club_notices DROP CONSTRAINT IF EXISTS club_notices_created_by_fkey;
ALTER TABLE club_notices ADD CONSTRAINT club_notices_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE club_notices ADD COLUMN IF NOT EXISTS created_by_name_at_time TEXT;   -- survives purge

-- contact_category_members
ALTER TABLE contact_category_members RENAME COLUMN contact_id TO person_id;
ALTER TABLE contact_category_members DROP CONSTRAINT IF EXISTS contact_category_members_contact_id_fkey;
ALTER TABLE contact_category_members ADD CONSTRAINT contact_category_members_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- documents
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE documents ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_name_at_time TEXT;   -- survives purge

-- dvd_loans
ALTER TABLE dvd_loans RENAME COLUMN member_id TO person_id;
ALTER TABLE dvd_loans ALTER COLUMN person_id DROP NOT NULL;   -- required for ON DELETE SET NULL
ALTER TABLE dvd_loans DROP CONSTRAINT IF EXISTS dvd_loans_member_id_fkey;
ALTER TABLE dvd_loans ADD CONSTRAINT dvd_loans_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE dvd_loans ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge

-- event_coordinators
ALTER TABLE event_coordinators RENAME COLUMN member_id TO person_id;
ALTER TABLE event_coordinators ALTER COLUMN person_id DROP NOT NULL;   -- required for ON DELETE SET NULL
ALTER TABLE event_coordinators DROP CONSTRAINT IF EXISTS event_coordinators_member_id_fkey;
ALTER TABLE event_coordinators ADD CONSTRAINT event_coordinators_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE event_coordinators ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge
ALTER TABLE event_coordinators DROP CONSTRAINT IF EXISTS event_coordinators_assigned_by_fkey;
ALTER TABLE event_coordinators ADD CONSTRAINT event_coordinators_assigned_by_fkey FOREIGN KEY (assigned_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE event_coordinators DROP CONSTRAINT IF EXISTS event_coordinators_replaced_by_fkey;
ALTER TABLE event_coordinators ADD CONSTRAINT event_coordinators_replaced_by_fkey FOREIGN KEY (replaced_by)
  REFERENCES people(id) ON DELETE SET NULL;

-- event_series
ALTER TABLE event_series DROP CONSTRAINT IF EXISTS event_series_created_by_fkey;
ALTER TABLE event_series ADD CONSTRAINT event_series_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS created_by_name_at_time TEXT;   -- survives purge

-- events
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_created_by_fkey;
ALTER TABLE events ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by_name_at_time TEXT;   -- survives purge
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_coordinator_id_fkey;
ALTER TABLE events ADD CONSTRAINT events_coordinator_id_fkey FOREIGN KEY (coordinator_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS coordinator_name_at_time TEXT;   -- survives purge
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_bus_driver_id_fkey;
ALTER TABLE events ADD CONSTRAINT events_bus_driver_id_fkey FOREIGN KEY (bus_driver_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS bus_driver_name_at_time TEXT;   -- survives purge
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_payments_reconciled_by_fkey;
ALTER TABLE events ADD CONSTRAINT events_payments_reconciled_by_fkey FOREIGN KEY (payments_reconciled_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS payments_reconciled_by_name_at_time TEXT;   -- survives purge

-- hub_followers
ALTER TABLE hub_followers RENAME COLUMN member_id TO person_id;
ALTER TABLE hub_followers DROP CONSTRAINT IF EXISTS hub_followers_member_id_fkey;
ALTER TABLE hub_followers ADD CONSTRAINT hub_followers_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- hub_settings
ALTER TABLE hub_settings DROP CONSTRAINT IF EXISTS hub_settings_updated_by_fkey;
ALTER TABLE hub_settings ADD CONSTRAINT hub_settings_updated_by_fkey FOREIGN KEY (updated_by)
  REFERENCES people(id) ON DELETE SET NULL;

-- movie_ownership
ALTER TABLE movie_ownership RENAME COLUMN member_id TO person_id;
ALTER TABLE movie_ownership DROP CONSTRAINT IF EXISTS movie_ownership_member_id_fkey;
ALTER TABLE movie_ownership ADD CONSTRAINT movie_ownership_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- movies
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_suggested_by_fkey;
ALTER TABLE movies ADD CONSTRAINT movies_suggested_by_fkey FOREIGN KEY (suggested_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS suggested_by_name_at_time TEXT;   -- survives purge

-- notices
ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_created_by_fkey;
ALTER TABLE notices ADD CONSTRAINT notices_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS created_by_name_at_time TEXT;   -- survives purge

-- notifications
ALTER TABLE notifications RENAME COLUMN member_id TO person_id;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_member_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- push_subscriptions
ALTER TABLE push_subscriptions RENAME COLUMN member_id TO person_id;
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_member_id_fkey;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;

-- question_replies
ALTER TABLE question_replies RENAME COLUMN member_id TO person_id;
ALTER TABLE question_replies DROP CONSTRAINT IF EXISTS question_replies_member_id_fkey;
ALTER TABLE question_replies ADD CONSTRAINT question_replies_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE question_replies ADD COLUMN IF NOT EXISTS person_name_at_time TEXT;   -- survives purge

-- questions
ALTER TABLE questions RENAME COLUMN asker_member_id TO asker_person_id;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_asker_member_id_fkey;
ALTER TABLE questions ADD CONSTRAINT questions_asker_person_id_fkey FOREIGN KEY (asker_person_id)
  REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_answered_by_fkey;
ALTER TABLE questions ADD CONSTRAINT questions_answered_by_fkey FOREIGN KEY (answered_by)
  REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answered_by_name_at_time TEXT;   -- survives purge

-- space_owners
ALTER TABLE space_owners RENAME COLUMN member_id TO person_id;
ALTER TABLE space_owners DROP CONSTRAINT IF EXISTS space_owners_member_id_fkey;
ALTER TABLE space_owners ADD CONSTRAINT space_owners_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE space_owners DROP CONSTRAINT IF EXISTS space_owners_created_by_fkey;
ALTER TABLE space_owners ADD CONSTRAINT space_owners_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES people(id) ON DELETE SET NULL;

-- votes
ALTER TABLE votes RENAME COLUMN member_id TO person_id;
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_member_id_fkey;
ALTER TABLE votes ADD CONSTRAINT votes_person_id_fkey FOREIGN KEY (person_id)
  REFERENCES people(id) ON DELETE CASCADE;


-- ─── §2b TABLES CREATED AFTER THIS MIGRATION WAS WRITTEN ────────────────────
-- 069 was written on 2026-07-30 against the 39 person-referencing columns that
-- existed then. `space_bookings` (migration 072) arrived afterwards and carries
-- its own FK to `members`, so running the migrations in numeric order used to
-- fail at 072 with `relation "members" does not exist`.
--
-- Caught by applying every migration in order against a replica. Note that
-- §4's check would NOT have caught it: dropping `members` CASCADE silently
-- removes the dependent FK and leaves `booked_by` as a bare uuid column, so the
-- damage is invisible rather than loud.
--
-- Guarded, because 069 may run on a database where 072 has not been applied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='space_bookings') THEN

    ALTER TABLE space_bookings ADD COLUMN IF NOT EXISTS community_id UUID;
    UPDATE space_bookings SET community_id =
      (SELECT id FROM communities WHERE slug='fullerton-cove') WHERE community_id IS NULL;
    ALTER TABLE space_bookings ALTER COLUMN community_id SET NOT NULL;
    ALTER TABLE space_bookings DROP CONSTRAINT IF EXISTS space_bookings_community_fk;
    ALTER TABLE space_bookings ADD  CONSTRAINT space_bookings_community_fk
      FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS space_bookings_community_idx ON space_bookings (community_id);

    -- booked_by already has its booked_by_name_at_time snapshot, so SET NULL
    -- keeps the booking readable after a purge.
    -- Column name stays `booked_by` in both orders; only the FK target moves.
    ALTER TABLE space_bookings DROP CONSTRAINT IF EXISTS space_bookings_booked_by_fkey;
    ALTER TABLE space_bookings ADD  CONSTRAINT space_bookings_booked_by_fkey
      FOREIGN KEY (booked_by) REFERENCES people(id) ON DELETE SET NULL;

    RAISE NOTICE 'space_bookings repointed onto people and scoped to the community.';
  ELSE
    RAISE NOTICE 'space_bookings does not exist yet - migration 072 will create it already-correct.';
  END IF;
END $$;


-- ─── §3 RETIRE THE OLD MODEL ────────────────────────────────────────────────
-- contact_categories is now a grouping of PEOPLE, not of contacts. Renaming it
-- is not cosmetic: leaving 'contact_' in the schema is precisely how the
-- members/contacts confusion survived six rounds of patching.
ALTER TABLE contact_categories       RENAME TO categories;
ALTER TABLE contact_category_members RENAME TO category_people;
ALTER TABLE category_people RENAME CONSTRAINT contact_category_members_pkey TO category_people_pkey;

-- settings becomes per-community. invite_token moves to communities.invite_token
-- (typed and indexed, since registration looks it up) and is removed here so
-- there is exactly ONE source of truth for it.
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD  CONSTRAINT settings_pkey PRIMARY KEY (community_id, key);
DELETE FROM settings WHERE key = 'invite_token';

-- Nothing references them any more; §2 repointed all 39 columns.
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS members  CASCADE;


-- ─── §4 VERIFY — raises if anything is wrong ────────────────────────────────
DO $$
DECLARE
  v_left    INTEGER;
  v_missing TEXT;
  v_snaps   INTEGER;
BEGIN
  -- nothing anywhere still points at the old tables
  SELECT count(*) INTO v_left
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name IN ('member_id','contact_id','owner_contact_id','asker_member_id');
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Cutover incomplete: % old person columns remain', v_left;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name IN ('members','contacts')) THEN
    RAISE EXCEPTION 'members/contacts still exist';
  END IF;

  -- Any uuid column whose name says "person" but which points at NOTHING is an
  -- orphan left behind by a DROP ... CASCADE. This is the check that would have
  -- caught space_bookings.booked_by, and will catch the next one.
  SELECT string_agg(c.table_name || '.' || c.column_name, ', ') INTO v_missing
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.data_type = 'uuid'
     AND (c.column_name LIKE '%person_id' OR c.column_name IN
          ('booked_by','created_by','added_by','suggested_by','uploaded_by',
           'answered_by','recorded_by','updated_by','assigned_by','replaced_by',
           'coordinator_id','bus_driver_id','payments_reconciled_by'))
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint fk
         JOIN pg_class t ON t.oid = fk.conrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (fk.conkey)
        WHERE fk.contype = 'f' AND t.relname = c.table_name AND a.attname = c.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Person columns with no foreign key (orphaned by CASCADE): %', v_missing;
  END IF;

  -- community_id present and NOT NULL everywhere it should be
  SELECT string_agg(t, ', ') INTO v_missing
    FROM unnest(ARRAY['bar_member_payments','bar_products','bar_reconciliations','bar_tabs','book_votes','booking_attendees','bookings','books','club_bring_categories','club_members','club_notices','clubs','categories','category_people','document_categories','documents','dvd_loans','event_coordinators','event_series','events','hub_followers','hub_settings','locations','movie_ownership','movies','notices','notifications','push_subscriptions','question_replies','questions','settings','space_owners','votes']) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name = t
        AND c.column_name='community_id' AND c.is_nullable='NO');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'community_id missing or nullable on: %', v_missing;
  END IF;

  -- every snapshot column landed
  SELECT count(*) INTO v_snaps
    FROM information_schema.columns
   WHERE table_schema='public' AND column_name LIKE '%_name_at_time'
     -- occupancies belongs to 068 and space_bookings to 072; neither snapshot
     -- is created by this migration, so neither is counted here.
     AND table_name NOT IN ('occupancies', 'space_bookings');
  IF v_snaps <> 21 THEN
    RAISE EXCEPTION 'Expected 21 snapshot columns, found %', v_snaps;
  END IF;

  RAISE NOTICE 'OK: 38 references repointed, community_id on 33 tables, 21 snapshots, old tables gone.';
END $$;


-- ─── §5 PURGE PROOF — the Slice B completion gate ───────────────────────────
-- The scope is explicit: "Slice B is not done until a purge on a throwaway
-- person leaves every historical row readable." This IS that test, and it runs
-- as part of the migration rather than sitting in a doc as an intention.
--
-- It creates its own throwaway event + person, records an act (a booking) and a
-- piece of purely personal data (a notification), purges the person, then
-- asserts all four required behaviours. It cleans up after itself.
-- Verified passing against a full replica of production before shipping.
DO $$
DECLARE c UUID; p UUID; e UUID; b UUID; nm TEXT; n INT;
BEGIN
  SELECT id INTO c FROM communities WHERE slug='fullerton-cove';
  INSERT INTO events (community_id, title, event_date, event_time)
       VALUES (c,'ZZ Purge Proof Event', CURRENT_DATE, '19:00') RETURNING id INTO e;
  INSERT INTO people (community_id, first_name, last_name)
       VALUES (c,'ZZPurge','Proof') RETURNING id INTO p;

  -- an act by that person, with the snapshot written at creation time
  INSERT INTO bookings (community_id, event_id, person_id, person_name_at_time)
       VALUES (c, e, p, 'ZZPurge Proof') RETURNING id INTO b;
  -- and one piece of their own data, which SHOULD die with them
  INSERT INTO notifications (community_id, person_id, type, message)
       VALUES (c, p, 'test', 'should not survive');

  ------------------------------------------------------------------ THE PURGE
  DELETE FROM people WHERE id = p;

  -- 1. the booking must SURVIVE
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = b) THEN
    RAISE EXCEPTION 'FAIL: booking was cascade-deleted - purge destroys history';
  END IF;
  -- 2. its person_id must be NULL, not dangling
  IF (SELECT person_id FROM bookings WHERE id = b) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: bookings.person_id was not set to NULL';
  END IF;
  -- 3. and it must STILL NAME THE PERSON
  SELECT person_name_at_time INTO nm FROM bookings WHERE id = b;
  IF nm IS DISTINCT FROM 'ZZPurge Proof' THEN
    RAISE EXCEPTION 'FAIL: snapshot lost - the booking is now anonymous (got %)', nm;
  END IF;
  -- 4. their own personal data must be GONE
  SELECT count(*) INTO n FROM notifications WHERE message = 'should not survive';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % notification(s) survived the purge', n;
  END IF;

  DELETE FROM bookings WHERE id = b;
  DELETE FROM events   WHERE id = e;
  RAISE NOTICE 'OK: purge proof passed - history survived and still names the person, personal data gone.';
END $$;


-- ─── §6 NEXT STEP IS MANDATORY, NOT OPTIONAL ────────────────────────────────
-- Dropping members cascaded away 39 RLS policies (verified in the sandbox: 25
-- of 64 survive, and 13 tables end up RLS-enabled with ZERO policies, i.e.
-- readable only by the service role). The app WILL be broken until
-- 091_foundation_rls.sql runs. Do not stop here.



COMMIT;
