-- Migration 014: Event Coordinators junction table, book genres, EC notes
-- Run in Supabase SQL Editor after 013_profile_email_hidename.sql

-- ─── EVENT COORDINATORS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_coordinators (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  replaced_at  TIMESTAMPTZ,
  replaced_by  UUID REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_coordinators_event  ON event_coordinators(event_id);
CREATE INDEX IF NOT EXISTS idx_event_coordinators_member ON event_coordinators(member_id);
CREATE INDEX IF NOT EXISTS idx_event_coordinators_active ON event_coordinators(event_id) WHERE replaced_at IS NULL;

ALTER TABLE event_coordinators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ec_read" ON event_coordinators
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ec_admin_write" ON event_coordinators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

-- ─── MIGRATE EXISTING coordinator_id DATA ─────────────────────────────────────
INSERT INTO event_coordinators (event_id, member_id, assigned_at)
SELECT id, coordinator_id, COALESCE(created_at, now())
FROM events
WHERE coordinator_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── EC NOTES ON EVENTS ───────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS coordinator_notes TEXT;

-- ─── BOOK GENRES ──────────────────────────────────────────────────────────────
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS genres TEXT;
