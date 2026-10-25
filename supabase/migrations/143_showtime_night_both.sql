-- 143_showtime_night_both.sql
--
-- Show Time > Suggestions: a film can be shown under BOTH tabs (Iain,
-- 2026-10-25: "there is NO reason a movie has to be on only one list").
-- Widens 142's check to allow 'both'. See lib/suggestionList.js inNight().
--
-- Additive (only allows a new value). Safe to run before the code deploys,
-- safe to run repeatedly.

BEGIN;

ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_showtime_night_check;
ALTER TABLE movies ADD CONSTRAINT movies_showtime_night_check
  CHECK (showtime_night IS NULL OR showtime_night IN ('action', 'sunday', 'both'));

COMMIT;
