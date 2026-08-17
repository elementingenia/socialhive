-- Migration 084: Location images (Social_Hive_Location_First_Booking_Scope_v2.md,
-- item 6, Iain 2026-08-17). All columns additive with safe defaults --
-- non-destructive, no data loss on rollback.
--
-- Mirrors the existing events.image_url + focal-point shape (migration 026)
-- exactly, so the admin upload endpoint/UI and the resident-facing display
-- can reuse the same pattern rather than inventing a new one.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_focal_x NUMERIC(5,2) NOT NULL DEFAULT 50;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_focal_y NUMERIC(5,2) NOT NULL DEFAULT 50;

-- ─── ROLLBACK (run manually if needed) ──────────────────────────────────────
-- ALTER TABLE locations DROP COLUMN IF EXISTS image_url;
-- ALTER TABLE locations DROP COLUMN IF EXISTS image_focal_x;
-- ALTER TABLE locations DROP COLUMN IF EXISTS image_focal_y;
