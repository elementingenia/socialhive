-- 135: Show Time repeating showings (Iain, 2026-10-10).
-- Scope: "Element Happenings – Show Time Repeating Showings – Scope Answered"
-- (Google Doc, Drive folder 0ADckvqFBnPA7Uk9PVA).
--
-- The Groups & Clubs repeat engine (event_series, migration 055) is reused for
-- Show Time instead of building a second one. A Show Time series creates its
-- dates straight away as "To be announced"; the coordinator sets each date's
-- film (or something else) later.
--
-- Additive only. Safe to run before the code deploys: nothing existing reads
-- these columns, and every existing series defaults to hub_type 'club'.

-- ── event_series: which hub, and Show Time's run settings ─────────────────
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS hub_type TEXT NOT NULL DEFAULT 'club';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_series_hub_type_check') THEN
    ALTER TABLE event_series ADD CONSTRAINT event_series_hub_type_check CHECK (hub_type IN ('club', 'movie'));
  END IF;
END $$;

-- Optional name shown on every date, e.g. "Friday Night Action Movies".
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS showing_name TEXT;
-- How many dates to keep ahead (creator's choice, capped at 12 -- agreed).
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS dates_ahead INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_series_dates_ahead_check') THEN
    ALTER TABLE event_series ADD CONSTRAINT event_series_dates_ahead_check
      CHECK (dates_ahead IS NULL OR (dates_ahead BETWEEN 1 AND 12));
  END IF;
END $$;
-- On: a new date is added as each one passes. Off: a fixed run.
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS keep_rolling BOOLEAN NOT NULL DEFAULT false;
-- Seats the creator keeps for themselves on every date.
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS coordinator_seats INT NOT NULL DEFAULT 0;
-- One Ingenia confirmation covers the whole run (agreed).
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS ingenia_confirmed BOOLEAN NOT NULL DEFAULT false;

-- ── events: name + "to be announced" per date ─────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS showing_name TEXT;
-- True until the coordinator chooses what's showing on this date.
ALTER TABLE events ADD COLUMN IF NOT EXISTS content_tba BOOLEAN NOT NULL DEFAULT false;
-- When the "still To be announced" nudge went to the coordinators (once only).
ALTER TABLE events ADD COLUMN IF NOT EXISTS tba_nudged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS events_content_tba_idx ON events (event_date) WHERE content_tba = true;

-- ── Mute one repeating showing (agreed: phase 1) ──────────────────────────
-- A Show Time member keeps getting every other Show Time alert; only this
-- series' "what's showing" alerts stop. Service role only (no client policy);
-- read and written through app/api/screenings/series.
CREATE TABLE IF NOT EXISTS showtime_series_mutes (
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  series_id  UUID NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, series_id)
);
ALTER TABLE showtime_series_mutes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_series' AND column_name = 'keep_rolling') THEN
    RAISE EXCEPTION 'FAIL: event_series.keep_rolling missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'content_tba') THEN
    RAISE EXCEPTION 'FAIL: events.content_tba missing';
  END IF;
  RAISE NOTICE 'OK: 135 Show Time repeating showings applied.';
END $$;
