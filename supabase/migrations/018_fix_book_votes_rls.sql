-- Migration 018: Fix book_votes RLS policy
--
-- book_votes_own_write was using auth.uid() = member_id, which compares
-- the auth UUID against the members table UUID — always fails.
-- Correct pattern (same as votes table): subquery to members via auth_id.

DROP POLICY IF EXISTS "book_votes_own_write" ON book_votes;

CREATE POLICY "book_votes_own_write" ON book_votes FOR ALL
  USING  (member_id = (SELECT id FROM members WHERE auth_id = auth.uid()))
  WITH CHECK (member_id = (SELECT id FROM members WHERE auth_id = auth.uid()));
