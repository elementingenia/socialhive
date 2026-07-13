-- 039_push_subscriptions.sql
-- Web Push subscriptions, one row per browser/device a resident has opted in
-- from. A member can have more than one (phone + tablet, etc.) — endpoint is
-- the natural unique key (it's unique per browser install already).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_member_id_idx ON push_subscriptions(member_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A resident can see/insert/delete only their own subscription rows.
-- Admins get no special carve-out here (unlike members_read) -- there's no
-- legitimate reason for one resident, admin or not, to read another's push
-- endpoint/keys. The server sends pushes via the service-role key, which
-- bypasses RLS entirely, so this doesn't need an admin bypass to function.
CREATE POLICY "push_subscriptions_own_select" ON push_subscriptions FOR SELECT USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
);
CREATE POLICY "push_subscriptions_own_insert" ON push_subscriptions FOR INSERT WITH CHECK (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
);
CREATE POLICY "push_subscriptions_own_delete" ON push_subscriptions FOR DELETE USING (
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
);
