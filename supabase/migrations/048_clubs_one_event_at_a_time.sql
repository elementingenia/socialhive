-- 048_clubs_one_event_at_a_time.sql
--
-- Book Club's page only let an admin add an event when there wasn't already an
-- upcoming one (one book cycle at a time). Generalising Book Club into the
-- Clubs engine carried that constraint to every club — wrong for most of them:
-- Iain 2026-07-17, "it is VERY likely a club will schedule several in advance"
-- (Dinner Club meets the last Thursday monthly, each themed and distinct).
--
-- So it becomes an explicit per-club capability rather than inherited
-- behaviour. ADDITIVE, defaults false (schedule freely) and is set true only
-- for Book Club, preserving its current behaviour exactly.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS one_event_at_a_time BOOLEAN NOT NULL DEFAULT false;
UPDATE clubs SET one_event_at_a_time = true WHERE slug = 'book-club';
