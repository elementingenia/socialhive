-- Migration 011: DVD Loans
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS dvd_loans (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  movie_id    UUID        NOT NULL REFERENCES movies(id)  ON DELETE CASCADE,
  member_id   UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  borrowed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  returned_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS dvd_loans_movie_active  ON dvd_loans(movie_id)  WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS dvd_loans_member_active ON dvd_loans(member_id) WHERE returned_at IS NULL;

ALTER TABLE dvd_loans ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see active loans (to know what's available)
CREATE POLICY "dvd_loans_select" ON dvd_loans
  FOR SELECT USING (true);

-- Members can borrow (insert) their own loans
CREATE POLICY "dvd_loans_insert" ON dvd_loans
  FOR INSERT WITH CHECK (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Members can return (update) their own loans only
CREATE POLICY "dvd_loans_update" ON dvd_loans
  FOR UPDATE USING (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid() LIMIT 1)
  );
