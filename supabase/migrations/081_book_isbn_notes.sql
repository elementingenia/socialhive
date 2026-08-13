-- 081_book_isbn_notes.sql
--
-- Adds isbn + notes to `books`, surfaced in the Book Library detail sheet
-- (2026-08-13 UI pass): ISBN shown as a plain number under the author line,
-- Notes shown as a click-to-view pill next to it when present.
--
-- Additive only -- safe to run before the app code deploys (app code uses
-- select('*') for books, never an explicit column list, so it won't error
-- either way; these columns are simply null/unused until this runs).

ALTER TABLE books ADD COLUMN IF NOT EXISTS isbn  TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS notes TEXT;
