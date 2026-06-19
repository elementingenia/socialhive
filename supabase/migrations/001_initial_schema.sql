-- The Social Hive — initial schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── MEMBERS ───────────────────────────────────────────────────────────────
CREATE TABLE members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  username     TEXT UNIQUE NOT NULL,
  pin          TEXT NOT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_admin     BOOLEAN DEFAULT false,
  joined_date  DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MOVIES ────────────────────────────────────────────────────────────────
CREATE TABLE movies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id       TEXT,
  imdb_id       TEXT,
  title         TEXT NOT NULL,
  year          TEXT,
  genre         TEXT,
  plot          TEXT,
  poster_url    TEXT,
  runtime       TEXT,
  director      TEXT,
  actors        TEXT,
  rating_imdb   TEXT,
  streaming_au  TEXT,
  we_own        BOOLEAN DEFAULT false,
  suggested_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'movie' CHECK (type IN ('movie', 'general')),
  title        TEXT NOT NULL,
  movie_id     UUID REFERENCES movies(id) ON DELETE SET NULL,
  event_date   DATE NOT NULL,
  event_time   TIME NOT NULL,
  max_seats    INTEGER DEFAULT 20,
  notes        TEXT,
  created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BOOKINGS ──────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status      TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
  booked_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, member_id)
);

-- ─── VOTES ─────────────────────────────────────────────────────────────────
CREATE TABLE votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id    UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  score       INTEGER CHECK (score BETWEEN 1 AND 5),
  voted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (movie_id, member_id)
);

-- ─── SETTINGS ──────────────────────────────────────────────────────────────
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('invite_token', 'element2026'),
  ('our_streaming_services', '[]'),
  ('app_name', 'The Social Hive');

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read" ON members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "members_admin_write" ON members FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movies_read" ON movies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "movies_admin_write" ON movies FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read" ON events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "events_admin_write" ON events FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings_own_read" ON bookings FOR SELECT USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);
CREATE POLICY "bookings_own_write" ON bookings FOR INSERT WITH CHECK (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
);
CREATE POLICY "bookings_own_cancel" ON bookings FOR UPDATE USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes_read" ON votes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "votes_own_write" ON votes FOR ALL USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "settings_admin_write" ON settings FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);
