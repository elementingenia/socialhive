-- Migration 003: events table expansion, books, notices
-- Run in Supabase SQL Editor after 002_profile_and_bar.sql

-- ─── EVENTS — rename type → hub_type, expand values ─────────────────────────
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
ALTER TABLE events RENAME COLUMN type TO hub_type;
ALTER TABLE events ADD CONSTRAINT events_hub_type_check
  CHECK (hub_type IN ('movie', 'bookclub', 'social', 'outings'));

-- Update any legacy 'general' rows to 'social'
UPDATE events SET hub_type = 'social' WHERE hub_type = 'general';

-- ─── EVENTS — new columns ─────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_public             BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS cost                  NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coordinator_id        UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_message       TEXT,
  ADD COLUMN IF NOT EXISTS max_seats_per_booking INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS show_attendee_names   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_required      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS description           TEXT,
  ADD COLUMN IF NOT EXISTS image_url             TEXT,
  ADD COLUMN IF NOT EXISTS archived              BOOLEAN DEFAULT false;

-- ─── BOOKINGS — new columns ───────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required', 'pending', 'confirmed', 'refunded'));

-- ─── MEMBERS — attendee name opt-out ─────────────────────────────────────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS show_name_on_bookings BOOLEAN DEFAULT true;

-- ─── BOOKS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_books_id  TEXT,
  title            TEXT NOT NULL,
  author           TEXT,
  cover_url        TEXT,
  summary          TEXT,
  rating           TEXT,
  rating_link      TEXT,
  added_by         UUID REFERENCES members(id) ON DELETE SET NULL,
  added_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books_read" ON books FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "books_admin_write" ON books FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- Link book to event
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES books(id) ON DELETE SET NULL;

-- ─── NOTICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('main', 'sub')),
  content     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ,
  archived    BOOLEAN DEFAULT false,
  created_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notices_auth_read" ON notices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "notices_admin_write" ON notices FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── PUBLIC / ANON ACCESS ────────────────────────────────────────────────────
-- Allow unauthenticated users to read events (for public calendar at /cal)
-- Private events (is_public=false) are returned but UI shows them as "Residents Only"
CREATE POLICY "events_anon_read" ON events
  FOR SELECT TO anon USING (true);
