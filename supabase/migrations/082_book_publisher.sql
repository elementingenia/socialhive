-- 082_book_publisher.sql
--
-- Adds `publisher` to `books` -- the physical-copy import (Element Movies
-- Book Library Test Batch spreadsheet) captures "Publisher (this copy)"
-- per book, which had nowhere to land. Needed before the 13-book import
-- can proceed (2026-08-13): the import writes this column, so it must
-- exist first.
--
-- Additive only -- safe to run before the app code deploys (app code uses
-- select('*') for books, never an explicit column list, so it won't error
-- either way; this column is simply null/unused until this runs).

ALTER TABLE books ADD COLUMN IF NOT EXISTS publisher TEXT;
