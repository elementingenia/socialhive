-- 049_events_bring_categories.sql
--
-- Per-event selection of which of the club's bring-a-dish categories apply.
-- Iain 2026-07-18: the club defines the full list (Entrée / Nibbles / Main /
-- Dessert / Drinks), but an individual event should choose which of those are
-- allowed, and an attendee booking that event only sees the allowed ones.
--
-- NULL = all of the club's categories are allowed (sensible default for events
-- created before this, and for admins who don't narrow the list).

ALTER TABLE events ADD COLUMN IF NOT EXISTS bring_category_ids UUID[];
