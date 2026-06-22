-- Migration 006: movie_ownership table
-- Run manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS movie_ownership (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ownership_type  TEXT NOT NULL CHECK (ownership_type IN ('digital', 'dvd')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate ownership records per member per movie per type
CREATE UNIQUE INDEX IF NOT EXISTS movie_ownership_unique
  ON movie_ownership (movie_id, member_id, ownership_type);

-- RLS: admins can do everything; no resident access
ALTER TABLE movie_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON movie_ownership
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE auth_id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE auth_id = auth.uid() AND is_admin = true
    )
  );
