-- 142_showtime_suggestion_list.sql
--
-- Show Time > Suggestions: two tabs and retiring films (Iain, 2026-10-25,
-- Element_Happenings_ShowTime_Suggestions_Scope_Answered).
--
--   showtime_night         'action' | 'sunday', set by an admin/Owner to
--                          override the tab guessed from genres. NULL =
--                          use the guess (lib/suggestionList.js nightFor).
--   suggestion_retired_at  set when an admin/Owner retires a film by hand.
--                          Auto-retiring (60+ days, under 3 votes) is
--                          worked out live and is not stored.
--   suggestion_clock_from  set when a film is brought back from Retired, so
--                          the 60-day clock restarts. NULL = count from
--                          added_at.
--
-- Columns on an existing table: no new grants needed (Coding Standard #10
-- applies to new tables). Writes go through app/api/movies/[id]/suggestion
-- (service role). Additive, safe to run before the code deploys, safe to
-- run repeatedly.

BEGIN;

ALTER TABLE movies ADD COLUMN IF NOT EXISTS showtime_night text;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS suggestion_retired_at timestamptz;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS suggestion_clock_from timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movies_showtime_night_check') THEN
    ALTER TABLE movies ADD CONSTRAINT movies_showtime_night_check
      CHECK (showtime_night IS NULL OR showtime_night IN ('action', 'sunday'));
  END IF;
END $$;

COMMIT;
