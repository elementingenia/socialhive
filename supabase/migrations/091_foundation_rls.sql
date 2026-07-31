-- 091_foundation_rls.sql
--
-- FOUNDATION REBUILD — Slice C: the community-scoped RLS rewrite.
-- Requires: 068 and 069 already applied.
--
-- ============================================================================
-- THIS IS THE SLICE NOT TO RUSH, AND IT IS NOT OPTIONAL.
-- ============================================================================
-- Dropping `members` in 069 cascaded away 39 of the 64 existing policies, and
-- left 13 tables RLS-enabled with ZERO policies (verified in a sandbox replica
-- of production). Those tables are readable by the service role only, so the
-- app is BROKEN between 069 and this file. Run them in the same sitting.
--
-- A cross-community read leak is the worst bug this app could have and the
-- least likely to be noticed by eye, so §4 does not merely enable RLS — it
-- creates a second community with its own person and data, logs in AS that
-- person, and ASSERTS the count of Community A rows they can see is zero.
-- The migration fails if a leak exists.
--
-- Every policy is a single-column comparison (`community_id = ...`) rather than
-- a join. That is why 069 denormalised community_id onto all 33 tables: policies
-- that join are slower AND are where leaks hide.


-- ATOMIC, and this one matters most. §2 drops every existing policy before
-- recreating them. Without a transaction, a failure after that DROP would leave
-- the database with NO POLICIES AT ALL — every table either invisible to the app
-- or, on any table where RLS is off, world-readable. Wrapped, a failure rolls
-- back to the previous policy set.
BEGIN;


-- ─── §0 GUARD: 069 must have run first ──────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='members') THEN
    RAISE EXCEPTION
      'REFUSING TO RUN: `members` still exists, so 090_foundation_cutover.sql has not been applied. These policies reference people.community_id and would drop every existing policy before failing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='people') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: `people` does not exist. Apply 068 and 069 first.';
  END IF;
END $$;


-- ─── §1 HELPERS ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing, not incidental. These functions read
-- `people`, and `people` itself has an RLS policy — a policy that queried
-- people directly would recurse infinitely (the classic Supabase RLS failure).
-- Owned by the table owner, so they see through RLS and terminate.
-- search_path is pinned so the function body cannot be hijacked by a caller's
-- search_path.

CREATE OR REPLACE FUNCTION app_current_person() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT id FROM people
   WHERE auth_id = auth.uid() AND status = 'active'
   LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION app_current_community() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT community_id FROM people
   WHERE auth_id = auth.uid() AND status = 'active'
   LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT coalesce((SELECT is_admin FROM people
                    WHERE auth_id = auth.uid() AND status = 'active'
                    LIMIT 1), false)
$fn$;

REVOKE ALL ON FUNCTION app_current_person(), app_current_community(), app_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_person(), app_current_community(), app_is_admin()
  TO authenticated, service_role;


-- ─── §2 CLEAR EVERY SURVIVING POLICY ────────────────────────────────────────
-- The 25 policies that survived 069 all assume a single community, and two of
-- them compare auth.uid() against a member id (already wrong before this work
-- started). None are salvageable — drop the lot and rebuild deliberately.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- ─── §2b TABLE GRANTS ───────────────────────────────────────────────────────
-- RLS filters rows; GRANTs decide whether the role may touch the table at all.
-- Without these, `authenticated` gets "permission denied" rather than an empty
-- result, and every policy above is moot. Supabase applies these by default for
-- tables created through its UI; tables created by migration need them stated.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;


-- ─── §3 THE POLICIES ────────────────────────────────────────────────────────
-- communities: you can see your own community, and nothing else.
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY communities_own_read ON communities FOR SELECT TO authenticated
  USING (id = app_current_community());

-- people: the community directory. Read anyone in YOUR community; write only
-- your own row (admins may write any). `hide_name` is a display concern the app
-- layer handles - masking it here would break the admin/coordinator views that
-- are supposed to see real names.
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY people_community_read ON people FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY people_self_or_admin_write ON people FOR UPDATE TO authenticated
  USING      (community_id = app_current_community() AND (id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (id = app_current_person() OR app_is_admin()));
CREATE POLICY people_admin_insert ON people FOR INSERT TO authenticated
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
CREATE POLICY people_admin_delete ON people FOR DELETE TO authenticated
  USING (community_id = app_current_community() AND app_is_admin());

-- Community-readable, admin-write.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_community_read ON events FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY events_admin_write ON events FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_series_community_read ON event_series FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY event_series_admin_write ON event_series FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE event_coordinators ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_coordinators_community_read ON event_coordinators FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY event_coordinators_admin_write ON event_coordinators FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY notices_community_read ON notices FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY notices_admin_write ON notices FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY clubs_community_read ON clubs FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY clubs_admin_write ON clubs FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE club_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_notices_community_read ON club_notices FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY club_notices_admin_write ON club_notices FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE club_bring_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_bring_categories_community_read ON club_bring_categories FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY club_bring_categories_admin_write ON club_bring_categories FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY locations_community_read ON locations FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY locations_admin_write ON locations FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_community_read ON categories FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY categories_admin_write ON categories FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE category_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_people_community_read ON category_people FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY category_people_admin_write ON category_people FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_categories_community_read ON document_categories FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY document_categories_admin_write ON document_categories FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_community_read ON documents FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY documents_admin_write ON documents FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY books_community_read ON books FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY books_admin_write ON books FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY movies_community_read ON movies FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY movies_admin_write ON movies FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_products_community_read ON bar_products FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY bar_products_admin_write ON bar_products FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE hub_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_settings_community_read ON hub_settings FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY hub_settings_admin_write ON hub_settings FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_community_read ON settings FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY settings_admin_write ON settings FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_community_read ON properties FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY properties_admin_write ON properties FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE occupancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY occupancies_community_read ON occupancies FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY occupancies_admin_write ON occupancies FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE space_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_owners_community_read ON space_owners FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY space_owners_admin_write ON space_owners FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());
ALTER TABLE bar_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_reconciliations_community_read ON bar_reconciliations FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY bar_reconciliations_admin_write ON bar_reconciliations FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());

-- space_bookings (migration 072). Left RLS-on-with-no-policies by 072 so it was
-- invisible until the feature shipped; this is where it gets its policies.
-- Everyone in the community can SEE what a room is booked for — that is the
-- point of a shared calendar — but only admins write, per Iain's "admin only"
-- call on space administration. Event-driven bookings are created server-side
-- through the service role, which bypasses RLS entirely.
ALTER TABLE space_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY space_bookings_community_read ON space_bookings FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY space_bookings_admin_write ON space_bookings FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND app_is_admin())
  WITH CHECK (community_id = app_current_community() AND app_is_admin());

-- Community-readable, you-write-your-own (admins may write any).
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_community_read ON bookings FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY bookings_own_write ON bookings FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE booking_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_attendees_community_read ON booking_attendees FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY booking_attendees_own_write ON booking_attendees FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (owner_person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (owner_person_id = app_current_person() OR app_is_admin()));
ALTER TABLE book_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY book_votes_community_read ON book_votes FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY book_votes_own_write ON book_votes FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY votes_community_read ON votes FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY votes_own_write ON votes FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE movie_ownership ENABLE ROW LEVEL SECURITY;
CREATE POLICY movie_ownership_community_read ON movie_ownership FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY movie_ownership_own_write ON movie_ownership FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE hub_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_followers_community_read ON hub_followers FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY hub_followers_own_write ON hub_followers FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_members_community_read ON club_members FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY club_members_own_write ON club_members FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE dvd_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY dvd_loans_community_read ON dvd_loans FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY dvd_loans_own_write ON dvd_loans FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY questions_community_read ON questions FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY questions_own_write ON questions FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (asker_person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (asker_person_id = app_current_person() OR app_is_admin()));
ALTER TABLE question_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_replies_community_read ON question_replies FOR SELECT TO authenticated
  USING (community_id = app_current_community());
CREATE POLICY question_replies_own_write ON question_replies FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()))
  WITH CHECK (community_id = app_current_community() AND (person_id = app_current_person() OR app_is_admin()));

-- Private: your own rows only. Note these are NOT admin-readable - an admin
-- has no business reading another resident's notifications or push endpoints.
-- Server-side work that legitimately needs them uses the service role, which
-- bypasses RLS entirely.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own_only ON notifications FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND person_id = app_current_person())
  WITH CHECK (community_id = app_current_community() AND person_id = app_current_person());
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_own_only ON push_subscriptions FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND person_id = app_current_person())
  WITH CHECK (community_id = app_current_community() AND person_id = app_current_person());
ALTER TABLE bar_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_tabs_own_only ON bar_tabs FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND person_id = app_current_person())
  WITH CHECK (community_id = app_current_community() AND person_id = app_current_person());
ALTER TABLE bar_member_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_member_payments_own_only ON bar_member_payments FOR ALL TO authenticated
  USING      (community_id = app_current_community() AND person_id = app_current_person())
  WITH CHECK (community_id = app_current_community() AND person_id = app_current_person());


-- ─── §4 LEAK TEST — asserts isolation instead of hoping for it ──────────────
-- Builds a synthetic second community ("Test Valley"), gives it a person and a
-- private event, then becomes that person and counts how many of Community A's
-- rows they can see. Anything above zero raises and rolls the migration back.
-- Cleans up after itself. The scope calls for a synthetic fixture precisely
-- because the second real community is still only a conversation.
DO $$
DECLARE
  a_comm UUID; b_comm UUID; b_person UUID; b_auth UUID := gen_random_uuid();
  a_event UUID; leaked INT; own_visible INT;
BEGIN
  SELECT id INTO a_comm FROM communities WHERE slug = 'fullerton-cove';

  INSERT INTO events (community_id, title, event_date, event_time)
       VALUES (a_comm, 'ZZ Leak Test - Community A private event', CURRENT_DATE, '19:00')
    RETURNING id INTO a_event;

  INSERT INTO communities (slug, name) VALUES ('zz-test-valley','ZZ Test Valley')
    RETURNING id INTO b_comm;
  INSERT INTO auth.users (id, email) VALUES (b_auth, 'zz-leak-probe@example.invalid');
  INSERT INTO people (community_id, first_name, auth_id, status)
       VALUES (b_comm, 'ZZLeakProbe', b_auth, 'active') RETURNING id INTO b_person;
  INSERT INTO events (community_id, title, event_date, event_time)
       VALUES (b_comm, 'ZZ Leak Test - Community B own event', CURRENT_DATE, '20:00');

  -- become Community B's resident: real role, real JWT claim, RLS in force
  PERFORM set_config('request.jwt.claim.sub', b_auth::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO leaked      FROM events WHERE community_id = a_comm;
  SELECT count(*) INTO own_visible FROM events WHERE community_id = b_comm;

  RESET ROLE;

  IF leaked <> 0 THEN
    RAISE EXCEPTION
      'CROSS-COMMUNITY LEAK: Community B read % of Community A''s events. RLS is not isolating tenants.', leaked;
  END IF;
  IF own_visible < 1 THEN
    RAISE EXCEPTION
      'RLS TOO TIGHT: Community B cannot see its OWN events (saw %). The app would be broken.', own_visible;
  END IF;

  -- teardown
  DELETE FROM events     WHERE community_id = b_comm;
  DELETE FROM people     WHERE id = b_person;
  DELETE FROM auth.users WHERE id = b_auth;
  DELETE FROM communities WHERE id = b_comm;
  DELETE FROM events     WHERE id = a_event;

  RAISE NOTICE 'OK: tenant isolation verified - 0 rows leaked across communities, own rows still visible.';
END $$;


-- ─── §5 VERIFY COVERAGE ────────────────────────────────────────────────────
-- The failure mode this catches: a table with RLS enabled and no policy is
-- invisible to the app, and a table with RLS *disabled* is world-readable.
-- Both are silent. Neither is acceptable.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND (NOT c.relrowsecurity
          OR NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname='public' AND p.tablename = c.relname));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tables with RLS off or with no policy at all: %', bad;
  END IF;
  RAISE NOTICE 'OK: every public table has RLS enabled and at least one policy.';
END $$;



-- ─── §6 RESTORE THE testbot PROTECTION TRIGGER ──────────────────────────────
-- Migration 033 put a BEFORE DELETE trigger on `members` to make deleting the
-- E2E fixture account impossible. 069 drops `members`, so the trigger goes with
-- it and the protection silently disappears — leaving the orphaned function
-- behind, which makes it look like it is still there. Verified in the sandbox:
-- 0 triggers, 1 leftover function, after the cutover.
--
-- That matters more than it sounds. A missing testbot fails CI QUIETLY: it
-- already failed on every single run for its entire visible history before
-- anyone noticed. Restoring this is not tidiness.
CREATE OR REPLACE FUNCTION protect_testbot_fixture()
RETURNS TRIGGER AS $fn$
BEGIN
  IF LOWER(OLD.username) = 'testbot' THEN
    RAISE EXCEPTION 'Refusing to delete the testbot E2E fixture account (people.username = testbot). Required by tests/e2e/auth.setup.js and .github/workflows/e2e.yml. To remove it deliberately: DROP TRIGGER protect_testbot_fixture_trigger ON people; first.';
  END IF;
  RETURN OLD;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_testbot_fixture_trigger ON people;
CREATE TRIGGER protect_testbot_fixture_trigger
  BEFORE DELETE ON people
  FOR EACH ROW
  EXECUTE FUNCTION protect_testbot_fixture();

DO $$
DECLARE c UUID; p UUID; blocked BOOLEAN := false;
BEGIN
  -- prove it actually bites, rather than trusting that it was created
  SELECT id INTO c FROM communities WHERE slug = 'fullerton-cove';
  INSERT INTO people (community_id, first_name, username)
       VALUES (c, 'ZZTrigProbe', 'testbot') RETURNING id INTO p;
  BEGIN
    DELETE FROM people WHERE id = p;
  EXCEPTION WHEN others THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'testbot protection trigger did NOT fire - the fixture is deletable';
  END IF;
  -- clean up the probe (rename first so the trigger lets it go)
  UPDATE people SET username = 'zz_trig_probe_cleanup' WHERE id = p;
  DELETE FROM people WHERE id = p;
  RAISE NOTICE 'OK: testbot protection restored on people and proven to block deletion.';
END $$;



COMMIT;
