-- ── hub_settings: admin-configurable welcome text per hub ─────────────────────
CREATE TABLE IF NOT EXISTS hub_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_type    TEXT NOT NULL UNIQUE,
  welcome_text TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES members(id) ON DELETE SET NULL
);

INSERT INTO hub_settings (hub_type) VALUES ('home'), ('movies'), ('bookclub'), ('social')
  ON CONFLICT (hub_type) DO NOTHING;

ALTER TABLE hub_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_settings_read_all"   ON hub_settings FOR SELECT USING (true);
CREATE POLICY "hub_settings_admin_write" ON hub_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM members WHERE id = auth.uid() AND is_admin = true));

-- ── bookings: per-booking name hide (EC/admin can anonymise individual attendee) ─
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS name_hidden BOOLEAN NOT NULL DEFAULT false;

-- ── events: community bus support (Social hub) ────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_bus BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS bus_driver_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- ── book_votes: community voting for book suggestions ─────────────────────────
CREATE TABLE IF NOT EXISTS book_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES books(id)   ON DELETE CASCADE,
  score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, book_id)
);

ALTER TABLE book_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "book_votes_read"       ON book_votes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "book_votes_own_write"  ON book_votes FOR ALL
  USING (auth.uid() = member_id) WITH CHECK (auth.uid() = member_id);
