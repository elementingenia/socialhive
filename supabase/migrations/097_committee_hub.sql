-- 097_committee_hub.sql
--
-- Committee Notice Board -- Social_Hive_Committee_Notice_Board_Scope_v3_FINAL
-- (Iain, through v3, 2026-09-07). SAFE TO RUN ON LIVE PRODUCTION. Purely
-- additive: 2 new tables, one new hub_settings seed row (enabled=false --
-- hidden until Iain flips it on via the admin toggle), and a one-time
-- Owners-seeding insert from the real Contacts -> Committee category.
--
-- ============================================================================
-- WHAT THIS IS -- read the scope doc for the full decision log. Summary:
-- ============================================================================
-- - ONE post type (decision 2): a "Committee Update" -- rich text + optional
--   single attachment. No separate Minutes-vs-Update structure.
-- - Notifications are BROADCAST BY DEFAULT, OPT-OUT (decision 3) -- the
--   inverse polarity of hub_followers/FollowHubButton (where *presence*
--   means "notify me" and default is opted-out). Deliberately a NEW table,
--   not a repurposed hub_followers row -- reusing it would silently flip
--   the meaning of "presence" for any other code that reads that table.
--   Here: ABSENCE from committee_notification_optouts = still subscribed
--   (the default for every resident); PRESENCE = opted out.
-- - No bespoke "Ask the Committee" button (decision 4) -- the standard
--   OwnersManager/ContactBar this hub gets automatically, for free, is v1's
--   only contact mechanism. Nothing to build here for that.
-- - Committee Owners can also upload to the Documents "Committee Meetings"
--   category (decision 5) -- handled in application code
--   (app/api/info/documents/route.js), not this migration.
-- - Colour: slate #475569 (decision 6, confirmed by Iain 2026-09-07 --
--   "neutral and administrative").
--
-- Permissions: create/edit/pin/archive a post = admin OR this hub's Owner
-- (lib/areaAuth.js's requireAdminOrAreaOwner(req, 'hub', 'committee') --
-- same primitive every other hub uses). The hub's own show/hide toggle
-- (hub_settings.enabled) is admin-only, same as Voting/Special Events.
-- Opting out of notifications = any resident, no owner/admin concept.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

-- ── committee_posts ─────────────────────────────────────────────────────────
-- Single post type (decision 2). Mirrors club_notices plus `pinned` and the
-- optional attachment pair (attachment reuses the existing 'community-docs'
-- Storage bucket -- the same one Documents uploads already use -- so no new
-- bucket is created here).
CREATE TABLE IF NOT EXISTS committee_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content         TEXT NOT NULL,
  attachment_url  TEXT,
  attachment_name TEXT,
  pinned          BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES members(id) ON DELETE SET NULL,
  archived        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_committee_posts_archived_pinned
  ON committee_posts(archived, pinned, created_at DESC);

ALTER TABLE committee_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS committee_posts_read ON committee_posts;
-- Authenticated read only, no client write policy -- writes go only through
-- the service-role API route (app/api/committee), same convention as
-- club_notices. Simpler and safer than replicating an Owner check inside SQL.
CREATE POLICY committee_posts_read ON committee_posts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── committee_notification_optouts ──────────────────────────────────────────
-- Inverted-polarity opt-out (decision 3, see header note above). Client-
-- writable via each resident's own row, mirroring hub_followers'
-- self-write RLS policy exactly (052_hub_followers.sql) -- just an
-- independent table, not a reinterpretation of that one.
CREATE TABLE IF NOT EXISTS committee_notification_optouts (
  member_id     UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  opted_out_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE committee_notification_optouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS committee_optouts_read       ON committee_notification_optouts;
DROP POLICY IF EXISTS committee_optouts_self_write  ON committee_notification_optouts;
CREATE POLICY committee_optouts_read ON committee_notification_optouts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY committee_optouts_self_write ON committee_notification_optouts FOR ALL USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ── hub_settings seed row ───────────────────────────────────────────────────
-- Hidden until Iain flips it on via the admin toggle, same as every other
-- occasional hub (Voting, Special Events). hub_settings.enabled already
-- exists (added migration 088) and defaults true, so this is additive only.
INSERT INTO hub_settings (hub_type, enabled) VALUES ('committee', false)
  ON CONFLICT (hub_type) DO NOTHING;

-- ── Owners seeding (one-time) ───────────────────────────────────────────────
-- Every member currently tagged "Committee" in Contacts is seeded as a
-- Committee hub Owner (Iain, 2026-09-07: "just make all committee members
-- Owner of the Hub. This is just to kick things off and is easily managed
-- manually once the build is done.") -- deliberately includes members who
-- are already app Admins (belt-and-braces for them; the assignment is what
-- actually matters for the two who aren't Admins today). Category tagging
-- lives on each resident's own linked `contacts` row (migration 030 --
-- contacts.member_id -> contact_category_members -> contact_categories;
-- the earlier member_categories table from migration 029 was dropped by
-- migration 030 and never used in production). Only catches Committee
-- contacts who are also linked member accounts, per space_owners.member_id's
-- FK -- matches the real Contacts -> Committee filter confirmed 2026-09-07
-- (6 people, all with house numbers).
INSERT INTO space_owners (context_type, context_key, member_id)
SELECT 'hub', 'committee', c.member_id
FROM contacts c
JOIN contact_category_members ccm ON ccm.contact_id = c.id
JOIN contact_categories cc ON cc.id = ccm.category_id
WHERE lower(cc.name) = 'committee' AND c.member_id IS NOT NULL
ON CONFLICT (context_type, context_key, member_id) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'committee' AND enabled = false) THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for committee was not created, or not created disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM space_owners WHERE context_type = 'hub' AND context_key = 'committee'
  ) THEN
    RAISE WARNING 'No Committee Owners were seeded -- either the Committee contacts category is empty, or none of its tagged contacts are linked to a member account. Check manually.';
  END IF;

  RAISE NOTICE 'OK: committee_posts and committee_notification_optouts created, hub_settings seeded disabled, Committee Owners seeded from Contacts.';
END $$;

COMMIT;
