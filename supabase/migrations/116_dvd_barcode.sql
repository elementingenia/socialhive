-- Migration 116: DVD barcode column
-- Additive, nullable — safe to run before or after the app code deploys.
--
-- Supports the scan-first "Add to DVD Library" flow (self-service, any
-- member — see Element_Happenings_DVD_Barcode_Add_Scope_Answered.md):
-- stores the raw scanned UPC/EAN digit string on the movies row so a
-- future scan of the same disc can be matched/deduped against it, and so
-- there's an audit trail of what was actually scanned versus resolved via
-- TMDB. Populated only when the row was added via a barcode scan; NULL for
-- every existing row and for anything added via manual title entry.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS barcode text;

COMMENT ON COLUMN movies.barcode IS 'Raw UPC/EAN digits from a barcode scan that resolved to this title, if the row was added that way. NULL for manually-added or bulk-imported rows.';
