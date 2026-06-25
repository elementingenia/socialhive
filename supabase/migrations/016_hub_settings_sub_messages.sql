-- Migration 016: Extend hub_settings with sub_messages + additional hub pages

-- Add sub_messages JSON array column (used for Hive Home sub-notices)
ALTER TABLE hub_settings
  ADD COLUMN IF NOT EXISTS sub_messages JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Add rows for Movies sub-pages
INSERT INTO hub_settings (hub_type, welcome_text, sub_messages)
VALUES
  ('movies_suggestions', '', '[]'),
  ('movies_dvd',         '', '[]')
ON CONFLICT (hub_type) DO NOTHING;

-- Ensure home row exists
INSERT INTO hub_settings (hub_type, welcome_text, sub_messages)
VALUES ('home', '', '[]')
ON CONFLICT (hub_type) DO NOTHING;
