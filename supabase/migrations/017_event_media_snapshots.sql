-- Migration 017: Event media snapshots for data integrity
--
-- Problem: when a book suggestion or movie suggestion is deleted, the event
-- loses its display data (title, cover, author/director) because book_id/movie_id
-- go to NULL via ON DELETE SET NULL.
--
-- Fix: store a JSONB snapshot of the linked media at the time the event is
-- saved. The snapshot is the source of truth for display; the FK is used only
-- for live linking while the source record still exists.

-- ── Snapshot columns ──────────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS book_snapshot  JSONB,
  ADD COLUMN IF NOT EXISTS movie_snapshot JSONB;

-- ── Backfill from existing live relations ──────────────────────────────────────
-- Books
UPDATE events e
SET book_snapshot = jsonb_build_object(
  'title',     b.title,
  'author',    b.author,
  'cover_url', b.cover_url
)
FROM books b
WHERE e.book_id = b.id
  AND e.book_snapshot IS NULL;

-- Movies
UPDATE events e
SET movie_snapshot = jsonb_build_object(
  'title',      m.title,
  'director',   m.director,
  'poster_url', m.poster_url,
  'year',       m.year
)
FROM movies m
WHERE e.movie_id = m.id
  AND e.movie_snapshot IS NULL;

-- ── Ensure ON DELETE SET NULL for both FKs ─────────────────────────────────────
-- book_id already SET NULL (migration 003). Re-confirm movie_id:
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_movie_id_fkey;
ALTER TABLE events
  ADD CONSTRAINT events_movie_id_fkey
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE SET NULL;
