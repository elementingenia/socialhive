-- 106_clear_book_club_suggestions.sql
--
-- Book Club Suggestions (BookCatalogue.js, served at /clubs/[slug]/suggestions)
-- queries `books` with no we_own filter, so every Book Library title
-- (we_own = true, added via /booklibrary/books "+ Add Book") has been
-- showing up in the Suggestions/voting list alongside genuine community
-- suggestions -- two different hubs sharing one unfiltered table. Confirmed
-- against the live code 2026-09-15 (components/BookCatalogue.js `load()`
-- has no .eq('we_own', ...) clause, vs. booklibrary/books/page.js which
-- does filter .eq('we_own', true)).
--
-- Iain confirmed (2026-09-15): wipe the current Suggestions list --
-- i.e. every books row that is NOT a Library-owned title -- rather than
-- just fixing the display filter. This migration is the data change only;
-- it does not touch app code, so the missing we_own filter in
-- BookCatalogue.js still needs fixing separately or this will simply
-- refill over time as new suggestions come in.
--
-- Safe by FK design already in place:
--   book_votes.book_id -> books(id) ON DELETE CASCADE   (015) -- votes go with their book
--   book_loans.book_id -> books(id) ON DELETE CASCADE   (080) -- N/A, loans only exist for we_own=true
--   events.book_id     -> books(id) ON DELETE SET NULL  (003) -- any past Book Club event that
--                                                                 used a suggested (non-owned) book
--                                                                 keeps its display data via the
--                                                                 event_media_snapshot columns (017),
--                                                                 only loses the live FK link.

DELETE FROM books WHERE we_own = false;

