-- 101_committee_documents.sql
--
-- Committee "attach + also file in Documents" UX (Iain, 2026-09-08) --
-- lets an Owner/Admin posting a Committee Update optionally nominate a
-- Documents category for the attachment in the same action, instead of
-- uploading it a second time on the separate Documents screen. SAFE TO
-- RUN ON LIVE PRODUCTION -- purely additive: one nullable column + index
-- on the existing `documents` table. No RLS change needed: `documents_read`
-- (migration 025) already allows any authenticated resident to read every
-- active document regardless of category, which is exactly what the new
-- Committee > Documents tab needs.
--
-- `source_committee_post_id` records that a document row was created
-- THROUGH the Committee composer (app/api/committee route.js POST), as
-- opposed to uploaded directly on the Documents admin screen -- this is
-- how the new Committee > Documents tab knows which documents to list
-- (Iain: "all documents added to updates where a category was nominated").
-- ON DELETE SET NULL, not CASCADE: archiving/removing the sourcing
-- Committee post must never delete or hide the document itself -- same
-- "no hard delete, and a post's lifecycle is independent of anything it
-- produced" reasoning already used everywhere else in this app.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_committee_post_id UUID REFERENCES committee_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_source_committee_post
  ON documents(source_committee_post_id)
  WHERE source_committee_post_id IS NOT NULL;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'source_committee_post_id'
  ) THEN
    RAISE EXCEPTION 'FAIL: documents.source_committee_post_id was not created';
  END IF;

  RAISE NOTICE 'OK: documents.source_committee_post_id added and indexed.';
END $$;

COMMIT;
