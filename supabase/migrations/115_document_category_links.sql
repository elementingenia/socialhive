-- 115_document_category_links.sql
--
-- Info > Documents: a document can belong to MORE THAN ONE category
-- (Iain, 2026-09-29). Adds a join table, same shape as contacts'
-- contact_category_members (migration 025), and backfills it from the
-- existing single documents.category_id so nothing already filed moves.
--
-- SAFE TO RUN ON LIVE PRODUCTION -- purely additive. documents.category_id
-- is left in place; app code keeps it mirrored to the FIRST selected
-- category purely for backward compatibility, but document_category_links
-- is the source of truth from this migration on.
--
-- The deploy that reads this table must NOT go live before this runs.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

CREATE TABLE IF NOT EXISTS document_category_links (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES document_categories(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_document_category_links_category
  ON document_category_links(category_id);

-- Backfill from the existing single category.
INSERT INTO document_category_links (document_id, category_id)
SELECT id, category_id FROM documents WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Read: anyone who can read documents can see which categories they're in
-- (same openness as documents_read / doc_categories_read). Writes go
-- through service-role API routes only, so no write policy is needed.
ALTER TABLE document_category_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc_category_links_read" ON document_category_links;
CREATE POLICY "doc_category_links_read" ON document_category_links FOR SELECT USING (true);

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM documents d
  WHERE d.category_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM document_category_links l
      WHERE l.document_id = d.id AND l.category_id = d.category_id
    );
  IF missing > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % documents missing their link row', missing;
  END IF;
END $$;

COMMIT;
