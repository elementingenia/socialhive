-- Migration 123: New Features announcements + Documents "New Features" folder
-- Scope: Element_Happenings_New_Features_Announcements_Scope_Answered (Iain,
-- decisions 2026-10-03). Additive only. Run BEFORE the app code deploys --
-- the Documents page reads document_categories.system_key and
-- documents.feature_date.
--
-- 1. document_categories.system_key -- marks a category the app itself
--    depends on. The app finds "New Features" by this key, never by name,
--    and refuses to delete a category that has one.
ALTER TABLE document_categories ADD COLUMN IF NOT EXISTS system_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS document_categories_system_key_uniq
  ON document_categories(system_key) WHERE system_key IS NOT NULL;
COMMENT ON COLUMN document_categories.system_key IS 'App-owned category key (e.g. new_features). Cannot be deleted from Manage Categories.';

INSERT INTO document_categories (name, display_order, system_key)
SELECT 'New Features', 9999, 'new_features'
WHERE NOT EXISTS (SELECT 1 FROM document_categories WHERE system_key = 'new_features');

-- 2. documents.feature_date -- the Sydney date of the daily New Features
--    announcement this PDF belongs to (one PDF per day, decision 1). Lets a
--    notification tap open exactly that day's document.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS feature_date DATE;
CREATE UNIQUE INDEX IF NOT EXISTS documents_feature_date_uniq
  ON documents(feature_date) WHERE feature_date IS NOT NULL;

-- 3. feature_announcements -- one row per delivered feature. Drafted at
--    session close-out (Claude, standing OK decision 2) or by an admin;
--    approved by an admin; announced by the daily 08:30 cron.
CREATE TABLE IF NOT EXISTS feature_announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  what_it_does  TEXT,
  how_to_use    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array of step strings, max 6
  where_to_find TEXT,
  source_ref    TEXT,                                 -- e.g. "PR #185"
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'approved', 'announced', 'rejected')),
  created_by    UUID REFERENCES members(id) ON DELETE SET NULL,  -- null = drafted by Claude
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  announced_on  DATE,                                 -- Sydney date it went out
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_feature_announcements_status ON feature_announcements(status, created_at);
-- Service-role only (all access via app/api/admin/new-features and the cron).
ALTER TABLE feature_announcements ENABLE ROW LEVEL SECURITY;

-- 4. Admin master switch + audience (decision 6). Reuses hub_settings.enabled
--    and hub_settings.digest_audience (migration 119) -- widened here so the
--    column's comment matches. Seeded OFF and Admins only.
COMMENT ON COLUMN hub_settings.digest_audience IS 'weekly_digest and new_features rows: who receives it -- admins (in-house trial) or community (every resident). Default admins.';
INSERT INTO hub_settings (hub_type, enabled, digest_audience) VALUES ('new_features', false, 'admins')
  ON CONFLICT (hub_type) DO NOTHING;
