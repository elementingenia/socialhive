-- 127_happenings_news_hearts.sql
-- Hearts on Happenings News posts (Iain, 2026-10-05): a positive-only
-- acknowledgement -- no comments, no dislike. One heart per resident per
-- post (composite primary key). Additive only: safe to run before the code
-- deploys, but the code that reads this table must NOT deploy before it runs.
--
-- RLS is enabled with NO policies on purpose: the table is read and written
-- only through the service-role API routes. Who hearted a post is visible
-- only to the post's author, admins and the area's Owner/EC (Iain's call),
-- so the browser must never be able to read this table directly.

CREATE TABLE IF NOT EXISTS happenings_news_hearts (
  post_id    UUID NOT NULL REFERENCES happenings_news_posts(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_happenings_news_hearts_member ON happenings_news_hearts(member_id);

ALTER TABLE happenings_news_hearts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'happenings_news_hearts') THEN
    RAISE EXCEPTION 'FAIL: happenings_news_hearts was not created';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'happenings_news_hearts') THEN
    RAISE EXCEPTION 'FAIL: happenings_news_hearts must have no RLS policies (service-role only)';
  END IF;
END $$;
