-- 045_clubs.sql
--
-- Phase 2a — Clubs hub (feedback round 2026-07-16, scope
-- Social_Hive_Phase2_Clubs_Scope.md, signed off). Generalises Book Club into
-- a data-driven "club": an admin can create any number of clubs that all share
-- one engine, rendered from config rather than a hardcoded per-hub page.
--
-- This migration is ADDITIVE and safe against current production: it creates
-- the club tables, adds events.club_id, widens the hub_type CHECK, and seeds
-- Book Club as club #1. It does NOT touch existing Book Club events yet (they
-- stay hub_type='bookclub' and keep running on /bookclub) — the event
-- migration is a later, separately-verified step (2b).

-- ── clubs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  description      TEXT,
  colour           TEXT DEFAULT 'var(--purple)',
  icon             TEXT,                          -- optional icon key/emoji
  sort_order       INTEGER NOT NULL DEFAULT 0,
  archived         BOOLEAN NOT NULL DEFAULT false,
  -- framework flags (Club Manager toggles these; the generic page renders from them)
  has_book_return  BOOLEAN NOT NULL DEFAULT false,
  has_kit_return   BOOLEAN NOT NULL DEFAULT false,
  has_theme        BOOLEAN NOT NULL DEFAULT false,
  has_cost         BOOLEAN NOT NULL DEFAULT false,
  bring_enabled    BOOLEAN NOT NULL DEFAULT false,
  catalogue_module TEXT NOT NULL DEFAULT 'none' CHECK (catalogue_module IN ('none', 'books')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── club_members (join = notice targeting only, NOT a booking gate) ────────────
CREATE TABLE IF NOT EXISTS club_members (
  club_id   UUID NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (club_id, member_id)
);

-- ── club_notices (per-club; only joined members get notified) ─────────────────
CREATE TABLE IF NOT EXISTS club_notices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_by UUID REFERENCES members(id) ON DELETE SET NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_club_notices_club ON club_notices(club_id);

-- ── club_bring_categories (per-club "bring something" taxonomy) ───────────────
CREATE TABLE IF NOT EXISTS club_bring_categories (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  label   TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_club_bring_categories_club ON club_bring_categories(club_id);

-- ── events.club_id + widened hub_type CHECK ('club' now, 'shed' for Phase 3) ──
ALTER TABLE events ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_club ON events(club_id);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_hub_type_check;
ALTER TABLE events ADD CONSTRAINT events_hub_type_check
  CHECK (hub_type IN ('movie', 'bookclub', 'social', 'outings', 'club', 'shed'));

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE clubs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_notices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_bring_categories ENABLE ROW LEVEL SECURITY;

-- clubs: everyone authenticated reads; admins write. (Also anon read so the
-- public calendar / unauthenticated club listing can resolve names later.)
DROP POLICY IF EXISTS "clubs_read"        ON clubs;
DROP POLICY IF EXISTS "clubs_anon_read"   ON clubs;
DROP POLICY IF EXISTS "clubs_admin_write" ON clubs;
CREATE POLICY "clubs_read"        ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_admin_write" ON clubs FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- club_members: a member manages their OWN membership (join/leave); admins all.
DROP POLICY IF EXISTS "club_members_read"       ON club_members;
DROP POLICY IF EXISTS "club_members_self_write" ON club_members;
DROP POLICY IF EXISTS "club_members_admin"      ON club_members;
CREATE POLICY "club_members_read" ON club_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "club_members_self_write" ON club_members FOR ALL USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- club_notices: authenticated read; admin write (club-EC write added in 2c).
DROP POLICY IF EXISTS "club_notices_read"        ON club_notices;
DROP POLICY IF EXISTS "club_notices_admin_write" ON club_notices;
CREATE POLICY "club_notices_read" ON club_notices FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "club_notices_admin_write" ON club_notices FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- club_bring_categories: authenticated read; admin write.
DROP POLICY IF EXISTS "club_bring_read"        ON club_bring_categories;
DROP POLICY IF EXISTS "club_bring_admin_write" ON club_bring_categories;
CREATE POLICY "club_bring_read" ON club_bring_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "club_bring_admin_write" ON club_bring_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ── Seed Book Club as club #1 (its events stay on /bookclub until 2b) ─────────
INSERT INTO clubs (name, slug, description, colour, sort_order, catalogue_module, has_book_return, has_kit_return)
SELECT 'Book Club', 'book-club', 'Monthly community book club — pick a book, read along, and meet to chat.', 'var(--purple)', 0, 'books', true, true
WHERE NOT EXISTS (SELECT 1 FROM clubs WHERE slug = 'book-club');
