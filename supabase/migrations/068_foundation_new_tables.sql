-- 068_foundation_new_tables.sql
--
-- FOUNDATION REBUILD, PART 1 OF 2 — the new tables only.
-- Scope: Social_Hive_Foundation_Scope.md (v4, approved by Iain 2026-07-30).
--
-- ============================================================================
-- THIS FILE IS SAFE TO RUN ON LIVE PRODUCTION RIGHT NOW.
-- ============================================================================
-- It only CREATEs four new tables that nothing in the deployed app references,
-- and seeds reference data into them. It does not touch `members`, `contacts`,
-- or any existing table. RLS is enabled with NO policies, so the new tables are
-- service-role-only and invisible to every client until we choose otherwise.
--
-- Part 2 (`069_foundation_cutover.sql`) is the destructive half — it rewires
-- every existing table onto `people` and drops members/contacts. That one runs
-- AT THE CLEAN-SLATE WIPE and NOT BEFORE.
--
-- Why split it this way: the scope says "fresh schema on an empty database",
-- and that is still true of part 2. But there is no reason to sit on part 1 —
-- getting the tables and the 122 properties in place now means the cutover is
-- a smaller, better-rehearsed operation, and the properties list is reference
-- data we want reviewed by a human before it matters.
--
-- SELF-VERIFYING: the DO block at the end raises an exception if anything is
-- wrong. If this script completes without error, it is correct — there are no
-- separate queries to run and eyeball.
--
-- Run in the Supabase SQL editor (DDL cannot be applied over the REST API).


-- ATOMIC: all-or-nothing, so a failure leaves production exactly as it was.
BEGIN;


-- ─── 0. RECORD THE "BEFORE" STATE ───────────────────────────────────────────
-- So §7 can PROVE this script left the existing model alone, rather than
-- asserting it. Temp table, so it vanishes with the session.
CREATE TEMP TABLE _before_068 AS
SELECT (SELECT count(*) FROM members)  AS members_n,
       (SELECT count(*) FROM contacts) AS contacts_n;


-- ─── 1. COMMUNITIES ─────────────────────────────────────────────────────────
-- The tenant. Only Fullerton Cove exists today; a second community is
-- exploratory (Iain, 2026-07-30). Adding the key now is nearly free; adding it
-- to 35 populated tables later is a project.

CREATE TABLE IF NOT EXISTS communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  operator      TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Australia/Sydney',
  -- Per-community, deliberately: a shared invite code would let a resident of
  -- one community register into another. Replaces settings.invite_token.
  invite_token  TEXT,
  -- wordmark, hub colours, feature flags. Theming itself is backlogged and
  -- scoped separately (Iain, 2026-07-30) - this is only the hook it hangs off.
  branding      JSONB NOT NULL DEFAULT '{}'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE communities IS
  'One row per community (tenant). See Social_Hive_Foundation_Scope.md.';


-- ─── 2. PEOPLE ──────────────────────────────────────────────────────────────
-- Replaces BOTH members and contacts. One row per human; having a login is a
-- property of the person, not a separate table.
--
-- Deliberately left EMPTY by this script. Populating it is Slice H, at the
-- wipe, from the reconciled Ingenia x WhatsApp dataset. Transforming the
-- current members+contacts into it is explicitly out of scope (§7) — a fresh
-- load is materially safer than a transform of the two-table mess.

CREATE TABLE IF NOT EXISTS people (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

  -- identity. Structured, not one `name` string: every username collision and
  -- every hyphenated-surname bug in the 2026-07-30 reconciliation came from
  -- regex-parsing a single field.
  first_name       TEXT NOT NULL,
  last_name        TEXT,
  display_name     TEXT,

  -- contact detail (dual-edit: the resident or an admin)
  email            TEXT,
  phone            TEXT,

  -- login. All null until they have one.
  username         TEXT,
  -- No plaintext PIN. Supabase Auth is the source of truth for credentials;
  -- this column exists only if a future flow needs a local hash. The old
  -- `pin` + `pin + '_hive'` shim does not come across.
  pin_hash         TEXT,
  -- Opaque and permanent. NEVER derive this from a username (migration 066's
  -- lesson - doing so made usernames immutable and nearly cost 28 bookings).
  auth_email       TEXT,
  auth_id          UUID,
  must_change_pin  BOOLEAN NOT NULL DEFAULT false,

  -- what kind of person. Replaces "Residents category as structure".
  person_type      TEXT NOT NULL DEFAULT 'resident'
                   CHECK (person_type IN ('resident','external','staff')),
  is_admin         BOOLEAN NOT NULL DEFAULT false,
  hide_name        BOOLEAN NOT NULL DEFAULT false,
  title            TEXT,

  -- lifecycle. TWO states only. `inactive` always means "no longer lives
  -- here" - residents being away is routine and the app has no reason to
  -- track it (Iain, 2026-07-30, rejecting a proposed third state).
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive')),
  -- the real-world fact of when they left; may be backdated
  left_on          DATE,
  -- when the undo window closes. Set to (date of the admin action + 30 days),
  -- NEVER (left_on + 30) - otherwise recording a two-month-old move-out would
  -- purge immediately, destroying the safeguard in exactly the case it exists
  -- for. Two dates, two jobs.
  purge_after      DATE,

  joined_date      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- An external person can NEVER log in. A constraint, not a convention -
  -- "we just won't do that" is how Residents-category-as-structure started.
  CONSTRAINT people_external_have_no_login CHECK (
    person_type <> 'external'
    OR (username IS NULL AND pin_hash IS NULL AND auth_email IS NULL AND auth_id IS NULL)
  ),
  -- An active person never has a purge pending or a leaving date.
  CONSTRAINT people_no_purge_while_active CHECK (
    status = 'inactive' OR (purge_after IS NULL AND left_on IS NULL)
  )
);

-- Username unique per community (case-insensitive), auth_email globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS people_username_per_community
  ON people (community_id, lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_auth_email_unique
  ON people (lower(auth_email))             WHERE auth_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_community      ON people (community_id);
CREATE INDEX IF NOT EXISTS people_active         ON people (community_id, status);
-- the purge cron's only scan
CREATE INDEX IF NOT EXISTS people_pending_purge  ON people (purge_after)
  WHERE purge_after IS NOT NULL;

COMMENT ON COLUMN people.purge_after IS
  'Date the undo window closes for an inactive person. Set to action_date + 30 '
  'days, never left_on + 30 - a backdated move-out must still get a full 30-day '
  'window, because the window exists to catch admin error.';


-- ─── 3. PROPERTIES ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  -- text, not integer: '12A' and similar exist in other communities
  ref           TEXT NOT NULL,
  street        TEXT,
  -- numeric ordering without having to parse ref
  sort_order    INTEGER,
  -- 'vacant' vs 'unbuilt' is a real distinction the current model cannot make:
  -- 41 of Fullerton Cove's 122 units have nobody known against them, clustered
  -- (48-55, 38-41, 116-119) in a way that suggests unsold/unbuilt stages rather
  -- than non-participation. Recording it beats inferring it from absence.
  status        TEXT NOT NULL DEFAULT 'vacant'
                CHECK (status IN ('occupied','vacant','unbuilt','withheld')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, ref)
);

CREATE INDEX IF NOT EXISTS properties_community_sort
  ON properties (community_id, sort_order);


-- ─── 4. OCCUPANCIES ─────────────────────────────────────────────────────────
-- Who lives where, with dates. This is what makes deactivation one action and
-- makes "who lived at #45 in 2025" answerable.

CREATE TABLE IF NOT EXISTS occupancies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: an occupancy is a historical fact and must survive
  -- the person being purged. See person_name_at_time below.
  person_id     UUID REFERENCES people(id)     ON DELETE SET NULL,
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- THE SNAPSHOT. Iain's purge decision (2026-07-30) means a person row can be
  -- deleted; without this the occupancy history becomes anonymous. It cannot be
  -- retrofitted - once the person is gone the name is gone.
  person_name_at_time TEXT NOT NULL,
  from_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  to_date       DATE,                    -- null = current
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT occupancies_dates_sane CHECK (to_date IS NULL OR to_date >= from_date)
);

-- The hot path: "who currently lives at this property".
CREATE INDEX IF NOT EXISTS occupancies_current
  ON occupancies (property_id) WHERE to_date IS NULL;
CREATE INDEX IF NOT EXISTS occupancies_person   ON occupancies (person_id);
CREATE INDEX IF NOT EXISTS occupancies_community ON occupancies (community_id);

COMMENT ON COLUMN occupancies.person_name_at_time IS
  'Denormalised name, written at creation. Survives a purge of the person so '
  'property history stays readable. Cannot be added retrospectively.';


-- ─── 5. RLS: LOCKED SHUT FOR NOW ────────────────────────────────────────────
-- Enabled with NO policies, so these tables are service-role-only and no
-- client can see them. The real community-scoped policies land in part 2, with
-- a negative test proving Community B cannot read Community A. Until then,
-- "invisible" is the correct and safest state.

ALTER TABLE communities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE people       ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties   ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancies  ENABLE ROW LEVEL SECURITY;


-- ─── 6. SEED: FULLERTON COVE + ITS 122 PROPERTIES ───────────────────────────
-- Reference data, not resident data. `people` stays empty (Slice H fills it at
-- the wipe). Every property starts 'vacant' because no occupancies exist yet;
-- Slice H sets 'occupied' as it creates them.

INSERT INTO communities (slug, name, operator, timezone, invite_token)
SELECT 'fullerton-cove', 'Fullerton Cove', 'Ingenia Communities', 'Australia/Sydney',
       (SELECT value FROM settings WHERE key = 'invite_token')
WHERE NOT EXISTS (SELECT 1 FROM communities WHERE slug = 'fullerton-cove');

INSERT INTO properties (community_id, ref, sort_order, status)
SELECT c.id, n::text, n, 'vacant'
  FROM communities c
  CROSS JOIN generate_series(1, 122) AS n
 WHERE c.slug = 'fullerton-cove'
   AND NOT EXISTS (
     SELECT 1 FROM properties p
      WHERE p.community_id = c.id AND p.ref = n::text
   );


-- ─── 7. VERIFY — raises if anything is wrong ────────────────────────────────
DO $$
DECLARE
  v_community UUID;
  v_props     INTEGER;
  v_people    INTEGER;
  v_invite    TEXT;
BEGIN
  SELECT id, invite_token INTO v_community, v_invite
    FROM communities WHERE slug = 'fullerton-cove';
  IF v_community IS NULL THEN
    RAISE EXCEPTION 'Fullerton Cove community row was not created';
  END IF;

  SELECT count(*) INTO v_props FROM properties WHERE community_id = v_community;
  IF v_props <> 122 THEN
    RAISE EXCEPTION 'Expected 122 properties, found %', v_props;
  END IF;

  SELECT count(*) INTO v_people FROM people;
  IF v_people <> 0 THEN
    RAISE EXCEPTION 'people should be EMPTY at this stage, found % rows', v_people;
  END IF;

  IF v_invite IS NULL THEN
    RAISE WARNING 'invite_token did not carry over from settings - set communities.invite_token manually';
  END IF;

  -- prove the constraints actually bite, rather than trusting they were written
  BEGIN
    INSERT INTO people (community_id, first_name, person_type, username)
    VALUES (v_community, 'ZZConstraintProbe', 'external', 'zzprobe');
    RAISE EXCEPTION 'CHECK people_external_have_no_login did NOT fire - external person accepted a username';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  BEGIN
    INSERT INTO people (community_id, first_name, status, purge_after)
    VALUES (v_community, 'ZZConstraintProbe', 'active', CURRENT_DATE + 30);
    RAISE EXCEPTION 'CHECK people_no_purge_while_active did NOT fire - active person accepted a purge date';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;

  -- and that the existing model is untouched — proven, not assumed
  IF (SELECT members_n  FROM _before_068) <> (SELECT count(*) FROM members)
  OR (SELECT contacts_n FROM _before_068) <> (SELECT count(*) FROM contacts) THEN
    RAISE EXCEPTION 'members/contacts row counts CHANGED - this script must not write to them';
  END IF;

  RAISE NOTICE 'OK: community seeded, 122 properties, people empty, both CHECKs enforced, members/contacts untouched.';
END $$;


COMMIT;
