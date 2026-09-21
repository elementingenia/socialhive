-- 112_happenings_news.sql
--
-- Happenings News -- replaces the earlier "Community Noticeboard" concept
-- (migration 111, never merged/run -- superseded before Iain uploaded it,
-- see Element_Happenings_Happenings_News_Scope_v2 on Drive for the full
-- decision log). Posting rights are tied to event coordination, not a
-- standing permission tier:
--
--   Any Event Coordinator (EC), for ANY event in ANY hub (Show Time, Social,
--   Special Events, Groups & Clubs, Book a Space), can add ONE Happenings
--   News post to their event once the event's date/time has passed --
--   automatic, no manual "mark completed" step. A post is text (<=1000
--   chars) + up to 10 photos, one nominated as the primary/headline photo.
--   Poster name/date/time are PUBLIC (everyone sees them -- reversed from
--   the old Noticeboard's Admin/Owner-only masking). The posting EC can
--   edit/delete their own post; Admins/Owners of that event's hub/club can
--   edit/delete any post (lib/areaAuth.js's requireEventManage covers both
--   shapes -- see lib/happeningsNewsAuth.js).
--
--   Per-hub admin setting: archive delay (hardcoded 30/90/150 days). Once a
--   post ages past that delay, a daily cron shrinks its photos to minimum
--   size and keeps the text forever -- nothing is hard-deleted by archiving.
--
--   NEW: every hub/club also gets a "Past Events" list (built in application
--   code straight off the existing events table, no new table needed) --
--   every past event in that hub/club, EC-posted-or-not, that drops an
--   event out once its Happenings News post is archived.
--
-- HIDDEN BY DEFAULT (enabled=false), and independently toggleable in
-- Preview vs Production via the SAME two-flag pattern the discarded
-- Noticeboard build introduced (confirmed 2026-09-21 by direct repo
-- inspection: hub_settings is one row shared identically across both
-- deployments, nothing reads process.env.VERCEL_ENV) -- carried forward
-- here since it's the one piece of that build genuinely worth keeping.
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Purely additive.
-- ============================================================================
--
-- ACTION NEEDED OUTSIDE THIS MIGRATION: create a public Storage bucket named
-- 'happenings-news-images' in the Supabase dashboard before this ships (same
-- as 'event-images' -- no migration in this repo creates a bucket via SQL,
-- they're all created once by hand and then written to via the service-role
-- client). Photo upload will 500 until that bucket exists.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

-- ── hub_settings: Preview/Production independence + archive-delay setting ──
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS production_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS happenings_news_archive_days INTEGER NOT NULL DEFAULT 90
  CHECK (happenings_news_archive_days IN (30, 90, 150));

INSERT INTO hub_settings (hub_type, enabled, production_enabled, happenings_news_archive_days)
VALUES ('happenings_news', false, false, 90)
ON CONFLICT (hub_type) DO NOTHING;

-- ── happenings_news_posts ───────────────────────────────────────────────────
-- One post per event (UNIQUE on event_id) -- an EC edits their existing post
-- rather than adding a second one. primary_photo_id's FK is added further
-- down, after happenings_news_photos exists (can't forward-reference).
CREATE TABLE IF NOT EXISTS happenings_news_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE, -- the posting EC
  content           TEXT NOT NULL CHECK (char_length(content) <= 1000),
  primary_photo_id  UUID, -- FK added below once happenings_news_photos exists
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_happenings_news_posts_created ON happenings_news_posts(created_at DESC);

-- ── happenings_news_photos ──────────────────────────────────────────────────
-- Up to 10 per post (enforced in application code, not a DB constraint --
-- same approach as every other "max N" rule in this app, e.g. bring-a-dish
-- categories). archived_at is set by the daily cron once the post ages past
-- its hub's archive_days -- the photo row/URL stays, storage_path is
-- re-uploaded at minimum size in place.
CREATE TABLE IF NOT EXISTS happenings_news_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES happenings_news_posts(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_happenings_news_photos_post ON happenings_news_photos(post_id, position);

ALTER TABLE happenings_news_posts DROP CONSTRAINT IF EXISTS happenings_news_posts_primary_photo_fkey;
ALTER TABLE happenings_news_posts ADD CONSTRAINT happenings_news_posts_primary_photo_fkey
  FOREIGN KEY (primary_photo_id) REFERENCES happenings_news_photos(id) ON DELETE SET NULL;

-- ── RLS: authenticated read, service-role write only ────────────────────────
-- Same shape as committee_posts (097) -- all writes go through the API
-- routes using the service-role client (lib/happeningsNewsAuth.js's
-- requireEventManage-based gate + isEventPast), so the client policy is
-- read-only with no write policy at all.
ALTER TABLE happenings_news_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS happenings_news_posts_read ON happenings_news_posts;
CREATE POLICY happenings_news_posts_read ON happenings_news_posts FOR SELECT USING (auth.uid() IS NOT NULL);

ALTER TABLE happenings_news_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS happenings_news_photos_read ON happenings_news_photos;
CREATE POLICY happenings_news_photos_read ON happenings_news_photos FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hub_settings
    WHERE hub_type = 'happenings_news' AND enabled = false AND production_enabled = false
  ) THEN
    RAISE EXCEPTION 'FAIL: hub_settings row for happenings_news was not created, or not created disabled in both environments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happenings_news_posts') THEN
    RAISE EXCEPTION 'FAIL: happenings_news_posts was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happenings_news_photos') THEN
    RAISE EXCEPTION 'FAIL: happenings_news_photos was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hub_settings' AND column_name = 'happenings_news_archive_days'
  ) THEN
    RAISE EXCEPTION 'FAIL: hub_settings.happenings_news_archive_days was not created';
  END IF;

  RAISE NOTICE 'OK: happenings_news_posts + happenings_news_photos created, hub_settings seeded disabled (both environments), archive-delay column added. Remember to create the happenings-news-images Storage bucket by hand before this ships.';
END $$;

COMMIT;
