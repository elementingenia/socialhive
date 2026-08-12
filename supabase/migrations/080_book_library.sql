-- 080_book_library.sql
--
-- Book Library — mirrors the DVD Library pattern (movies.we_own) on the
-- existing `books` table rather than creating a second content table.
-- `books` already carries google_books_id/title/author/cover_url/summary/
-- rating/rating_link from Book Club Suggestions; we_own + genre are the
-- only columns missing for it to behave the same way `movies` does for DVDs.
--
-- Scope: Owner_SelfService_and_Library_Hub_Scope_v1.

ALTER TABLE books ADD COLUMN IF NOT EXISTS we_own         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE books ADD COLUMN IF NOT EXISTS genre          TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS published_year INT;

CREATE INDEX IF NOT EXISTS idx_books_we_own ON books(we_own) WHERE we_own = true;

-- ── book_loans — mirrors dvd_loans exactly ──────────────────────────────────
CREATE TABLE IF NOT EXISTS book_loans (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id     UUID        NOT NULL REFERENCES books(id)   ON DELETE CASCADE,
  member_id   UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  borrowed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  returned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS book_loans_book_active   ON book_loans(book_id)   WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS book_loans_member_active ON book_loans(member_id) WHERE returned_at IS NULL;

ALTER TABLE book_loans ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see active loans (to know what's available) —
-- same policy shape as dvd_loans.
CREATE POLICY "book_loans_select" ON book_loans
  FOR SELECT USING (true);

CREATE POLICY "book_loans_insert" ON book_loans
  FOR INSERT WITH CHECK (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "book_loans_update" ON book_loans
  FOR UPDATE USING (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid() LIMIT 1)
  );

-- ── hub_settings.loan_cap — admin/owner-configurable, per hub ──────────────
-- Iain: don't hardcode the borrow limit for either collection. DVD's cap
-- (currently 3, hardcoded in app/(app)/dvd/page.js) and the new Library's
-- cap both read from here going forward, independently adjustable.
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS loan_cap INT NOT NULL DEFAULT 3;

INSERT INTO hub_settings (hub_type) VALUES ('library')
  ON CONFLICT (hub_type) DO NOTHING;
