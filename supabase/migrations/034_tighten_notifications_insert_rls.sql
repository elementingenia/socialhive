-- Migration 023's "service role insert" policy had no TO clause, so despite
-- its name and comment it actually applied to PUBLIC — any authenticated (or
-- even anon) user could insert an arbitrary notification row for any
-- member_id, not just the service role used by API routes.
--
-- The service_role Postgres role has BYPASSRLS and doesn't need a policy to
-- insert at all (that's how every existing createNotification() call already
-- works, via the SUPABASE_SERVICE_ROLE_KEY client). So the correct fix is to
-- simply remove the loose policy — this closes the forgery gap without
-- touching any legitimate insert path.

DROP POLICY IF EXISTS "service role insert" ON notifications;
