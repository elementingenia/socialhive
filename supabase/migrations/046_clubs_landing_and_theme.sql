-- 046_clubs_landing_and_theme.sql
--
-- Phase 2b prep. ADDITIVE and safe to run before the 2b code ships — nothing
-- reads these yet.
--
-- 1. clubs.welcome_text — the club landing-page banner text (club colour
--    background, white type). Iain 2026-07-17: this must be a STANDARD field on
--    every club in the Club Manager, not an Admin > Page Texts entry. Page
--    Texts doesn't scale to N clubs and splits a club's config across two
--    screens. Book Club's existing Page Texts welcome copy is carried across
--    below so nothing is lost.
-- 2. events.theme_name — the per-club optional "Theme" event field (gated by
--    clubs.has_theme).
-- 3. Backfill events.club_id for existing Book Club events. Safe now because
--    no code reads club_id yet; doing it here keeps the risky cutover
--    migration (047) down to just the hub_type flip.

ALTER TABLE clubs  ADD COLUMN IF NOT EXISTS welcome_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_name   TEXT;

-- Carry Book Club's existing landing copy over from hub_settings.
UPDATE clubs
   SET welcome_text = (SELECT welcome_text FROM hub_settings WHERE hub_type = 'bookclub')
 WHERE slug = 'book-club'
   AND (welcome_text IS NULL OR welcome_text = '');

-- Point existing Book Club events at the Book Club club row. hub_type stays
-- 'bookclub' for now — the flip happens in 047, together with the code sweep,
-- because 16 places still branch on hub_type = 'bookclub'.
UPDATE events
   SET club_id = (SELECT id FROM clubs WHERE slug = 'book-club')
 WHERE hub_type = 'bookclub'
   AND club_id IS NULL;
